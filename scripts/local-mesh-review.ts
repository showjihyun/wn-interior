import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { assessGeneratedMeshForReview } from '../src/application/generatedMeshReview.ts'

interface LocalReviewRecord {
  status?: string
  binary?: string
  asset?: {
    quarantineId?: string
    productId?: string
    productFingerprint?: string
    contentSha256?: string
    byteLength?: number
    generatedAt?: string
    generator?: { name?: string; version?: string }
    inspection?: {
      bounds?: { w?: number; d?: number; h?: number }
      triangles?: number
      silhouetteIou?: number
    }
    reviewViews?: Array<{ name?: string; sha256?: string; byteLength?: number }>
  }
}

export interface LoadedLocalMeshReview {
  asset: {
    assetId: string
    productId: string
    productFingerprint: string
    uri: string
    sha256: string
    byteLength: number
    generatedAt: string
    generatorLabel: string
    reviewReady: boolean
    reviewIssues: string[]
    maxDimensionRatioError: number
    reviewReportUrl?: string
  }
  routeBase: string
  directory: string
  allowedFiles: ReadonlySet<string>
}

export function loadLocalMeshReview(
  projectRoot: string,
  requestedRecord: string
): LoadedLocalMeshReview {
  const quarantineRoot = path.resolve(projectRoot, 'artifacts', 'generated-mesh', 'quarantine')
  const recordFile = path.resolve(projectRoot, requestedRecord)
  assertInside(quarantineRoot, recordFile)
  const record = JSON.parse(readFileSync(recordFile, 'utf8')) as LocalReviewRecord
  const asset = record.asset
  if (
    record.status !== 'review-pending' ||
    record.binary !== 'mesh.glb' ||
    !asset?.quarantineId ||
    !asset.productId ||
    !asset.productFingerprint ||
    !/^[a-f0-9]{64}$/.test(asset.contentSha256) ||
    !asset.generatedAt ||
    !asset.generator?.name ||
    !asset.generator.version ||
    !asset.inspection?.bounds ||
    ![asset.inspection.bounds.w, asset.inspection.bounds.d, asset.inspection.bounds.h].every(
      (value) => typeof value === 'number'
    ) ||
    typeof asset.inspection.triangles !== 'number' ||
    typeof asset.inspection.silhouetteIou !== 'number' ||
    !Array.isArray(asset.reviewViews)
  ) {
    throw new Error('local-mesh-review-record-invalid')
  }
  const directory = path.dirname(recordFile)
  const meshFile = path.resolve(directory, record.binary)
  assertInside(directory, meshFile)
  const mesh = readFileSync(meshFile)
  const sha256 = createHash('sha256').update(mesh).digest('hex')
  if (sha256 !== asset.contentSha256 || statSync(meshFile).size !== asset.byteLength) {
    throw new Error('local-mesh-review-content-mismatch')
  }
  const routeBase = `/__local-mesh-review__/${sha256}/`
  const allowedFiles = new Set(['mesh.glb'])
  for (const view of asset.reviewViews) {
    if (
      !/^[a-zA-Z0-9_-]+\.png$/.test(view.name) ||
      !/^[a-f0-9]{64}$/.test(view.sha256) ||
      !Number.isInteger(view.byteLength) ||
      view.byteLength <= 0
    ) {
      throw new Error('local-mesh-review-view-invalid')
    }
    const viewFile = path.resolve(directory, view.name)
    assertInside(directory, viewFile)
    const data = readFileSync(viewFile)
    const digest = createHash('sha256').update(data).digest('hex')
    if (digest !== view.sha256 || data.byteLength !== view.byteLength) {
      throw new Error(`local-mesh-review-view-mismatch:${view.name}`)
    }
    allowedFiles.add(view.name)
  }
  const product = productSnapshotFromFingerprint(asset.productFingerprint, asset.productId)
  const assessment = assessGeneratedMeshForReview(product, {
    productId: asset.productId,
    inspection: {
      bounds: {
        w: asset.inspection.bounds.w!,
        d: asset.inspection.bounds.d!,
        h: asset.inspection.bounds.h!,
      },
      triangles: asset.inspection.triangles,
      silhouetteIou: asset.inspection.silhouetteIou,
    },
    reviewViews: asset.reviewViews,
  })
  if (existsSync(path.join(directory, 'review.html'))) allowedFiles.add('review.html')
  return {
    asset: {
      assetId: `local-review-${asset.quarantineId}`,
      productId: asset.productId,
      productFingerprint: asset.productFingerprint,
      uri: `${routeBase}mesh.glb`,
      sha256,
      byteLength: mesh.byteLength,
      generatedAt: asset.generatedAt,
      generatorLabel: `${asset.generator.name} ${asset.generator.version}`,
      reviewReady: assessment.readyForHumanReview,
      reviewIssues: assessment.issues,
      maxDimensionRatioError: assessment.maxDimensionRatioError,
      reviewReportUrl: allowedFiles.has('review.html') ? `${routeBase}review.html` : undefined,
    },
    routeBase,
    directory,
    allowedFiles,
  }
}

function productSnapshotFromFingerprint(
  fingerprint: string,
  expectedProductId: string
): { id: string; dims: { w: number; d: number; h: number } } {
  const [version, productId, width, depth, height] = fingerprint.split('|')
  const dims = { w: Number(width), d: Number(depth), h: Number(height) }
  if (
    version !== 'product-mesh-v1' ||
    productId !== expectedProductId ||
    ![dims.w, dims.d, dims.h].every((value) => Number.isFinite(value) && value > 0)
  ) {
    throw new Error('local-mesh-review-product-fingerprint-invalid')
  }
  return { id: productId, dims }
}

export function localMeshReviewPlugin(review: LoadedLocalMeshReview | null): Plugin {
  return {
    name: 'local-mesh-review',
    apply: 'serve',
    configureServer(server) {
      if (!review) return
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://local').pathname
        if (!pathname.startsWith(review.routeBase)) return next()
        const fileName = decodeURIComponent(pathname.slice(review.routeBase.length))
        if (!review.allowedFiles.has(fileName)) {
          response.statusCode = 404
          response.end('local review asset not found')
          return
        }
        const file = path.resolve(review.directory, fileName)
        try {
          assertInside(review.directory, file)
          const data = readFileSync(file)
          response.statusCode = 200
          response.setHeader('Cache-Control', 'no-store')
          response.setHeader('X-Robots-Tag', 'noindex, nofollow')
          response.setHeader('Content-Type', contentType(fileName))
          response.end(data)
        } catch {
          response.statusCode = 404
          response.end('local review asset unavailable')
        }
      })
    },
  }
}

function assertInside(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('local-mesh-review-path-outside-root')
  }
}

function contentType(file: string): string {
  if (file.endsWith('.glb')) return 'model/gltf-binary'
  if (file.endsWith('.png')) return 'image/png'
  if (file.endsWith('.html')) return 'text/html; charset=utf-8'
  return 'application/octet-stream'
}
