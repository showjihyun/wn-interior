import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  GeneratedMeshInspector,
  GeneratedMeshQuarantine,
  ProductImageAsset,
  ProductImageAssetSource,
  GeneratedMeshReviewView,
  QuarantinedGeneratedMesh,
} from '../../application/generatedMeshLifecycle'
import type { ProductAppearance } from '../../domain/model'
import { inspectGlbMesh } from './glbValidation'

export class FileProductImageAssetSource implements ProductImageAssetSource {
  private readonly root: string

  constructor(publicRoot: string) {
    this.root = path.resolve(publicRoot)
  }

  async read(appearance: ProductAppearance): Promise<ProductImageAsset> {
    if (!appearance.textureUrl.startsWith('/catalog/'))
      throw new Error('image-path-not-allowlisted')
    const file = resolveInside(this.root, appearance.textureUrl.slice(1))
    const fileBytes = await readFile(file)
    const bytes = Uint8Array.from(fileBytes)
    return {
      bytes,
      mimeType: mimeTypeFor(file),
      sha256: createHash('sha256').update(fileBytes).digest('hex'),
    }
  }
}

export class GlbGeneratedMeshInspector implements GeneratedMeshInspector {
  async inspect(glb: Uint8Array) {
    const result = inspectGlbMesh(glb)
    if (!result.ok) throw new Error(`glb-inspection-failed:${result.reasons.join(',')}`)
    if (result.report.triangles > 500_000) throw new Error('glb-triangle-budget-exceeded')
    return { bounds: result.report.bounds, triangles: result.report.triangles }
  }
}

export class FileGeneratedMeshQuarantine implements GeneratedMeshQuarantine {
  private readonly root: string

  constructor(root: string) {
    this.root = path.resolve(root)
  }

  async save(
    asset: QuarantinedGeneratedMesh,
    glb: Uint8Array,
    reviewViews: GeneratedMeshReviewView[]
  ): Promise<string> {
    if (!safeSegment(asset.productId) || !safeSegment(asset.quarantineId)) {
      throw new Error('quarantine-id-invalid')
    }
    const actualSha256 = createHash('sha256').update(glb).digest('hex')
    if (actualSha256 !== asset.contentSha256 || glb.byteLength !== asset.byteLength) {
      throw new Error('quarantine-content-mismatch')
    }
    if (
      reviewViews.length !== asset.reviewViews.length ||
      reviewViews.some((view) => {
        const declared = asset.reviewViews.find((candidate) => candidate.name === view.name)
        const actual = createHash('sha256').update(view.png).digest('hex')
        return (
          !declared ||
          !safeReviewName(view.name) ||
          view.sha256 !== actual ||
          declared.sha256 !== actual ||
          declared.byteLength !== view.png.byteLength
        )
      })
    ) {
      throw new Error('quarantine-review-views-mismatch')
    }
    const directory = resolveInside(this.root, asset.productId, asset.quarantineId)
    await mkdir(directory, { recursive: true })
    const glbTarget = path.join(directory, 'mesh.glb')
    const recordTarget = path.join(directory, 'record.json')
    const nonce = `${process.pid}-${Date.now()}`
    const glbTemp = `${glbTarget}.${nonce}.tmp`
    const recordTemp = `${recordTarget}.${nonce}.tmp`
    await writeFile(glbTemp, glb)
    for (const view of reviewViews) {
      const target = path.join(directory, view.name)
      const temp = `${target}.${nonce}.tmp`
      await writeFile(temp, view.png)
      await rename(temp, target)
    }
    await writeFile(
      recordTemp,
      JSON.stringify(
        { schemaVersion: 1, status: 'review-pending', binary: 'mesh.glb', asset },
        null,
        2
      )
    )
    await rename(glbTemp, glbTarget)
    await rename(recordTemp, recordTarget)
    return path.relative(this.root, recordTarget).split(path.sep).join('/')
  }
}

function resolveInside(root: string, ...segments: string[]): string {
  const target = path.resolve(root, ...segments)
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('path-outside-root')
  return target
}

const safeSegment = (value: string) => /^[a-zA-Z0-9._-]+$/.test(value)
const safeReviewName = (value: string) => /^[a-zA-Z0-9_-]+\.png$/.test(value)

function mimeTypeFor(file: string): string {
  const extension = path.extname(file).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  throw new Error('image-type-not-supported')
}
