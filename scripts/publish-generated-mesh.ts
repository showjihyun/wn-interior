import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  publishGeneratedProductMesh,
  type ProductMeshHumanReview,
  type ProductMeshSourceAuthorization,
  type QuarantinedGeneratedMesh,
} from '../src/application/generatedMeshLifecycle'
import type { ApprovedProductMesh } from '../src/application/productMeshApproval'
import { inspectGlbMesh } from '../src/infrastructure/generated-mesh/glbValidation'
import { StaticProductCatalog } from '../src/infrastructure/reference-data/StaticReferenceData'

if (process.argv.includes('--help')) {
  console.log(
    '사용법: npm run mesh:publish -- --product <id> --record <quarantine/record.json> --rights <json> --review <json>'
  )
  process.exit(0)
}
const args = parseArgs(process.argv.slice(2))
const productId = required(args, '--product')
const quarantineRoot = path.resolve('artifacts', 'generated-mesh', 'quarantine')
const recordFile = resolveInside(quarantineRoot, path.resolve(required(args, '--record')))
const rightsFile = path.resolve(required(args, '--rights'))
const reviewFile = path.resolve(required(args, '--review'))
const publicRoot = path.resolve('public', 'catalog', 'generated')
const manifestFile = path.resolve(
  'src',
  'infrastructure',
  'generated-mesh',
  'published-manifest.v2.json'
)
const lockFile = `${manifestFile}.lock`

await writeFile(lockFile, `${process.pid}`, { flag: 'wx' })
try {
  const products = new StaticProductCatalog()
  const product = products.findById(productId)
  if (!product) throw new Error(`mesh-publish-product-not-found:${productId}`)
  const record = JSON.parse(await readFile(recordFile, 'utf8')) as {
    asset?: QuarantinedGeneratedMesh
    binary?: string
    status?: string
  }
  if (!record.asset || record.status !== 'review-pending' || record.binary !== 'mesh.glb') {
    throw new Error('mesh-publish-record-invalid')
  }
  const binaryFile = resolveInside(
    path.dirname(recordFile),
    path.resolve(path.dirname(recordFile), record.binary)
  )
  const glb = Uint8Array.from(await readFile(binaryFile))
  const actualHash = createHash('sha256').update(glb).digest('hex')
  const inspection = inspectGlbMesh(glb)
  if (!inspection.ok)
    throw new Error(`mesh-publish-inspection-failed:${inspection.reasons.join(',')}`)
  const asset: QuarantinedGeneratedMesh = {
    ...record.asset,
    contentSha256: actualHash,
    byteLength: glb.byteLength,
    inspection: {
      bounds: inspection.report.bounds,
      triangles: inspection.report.triangles,
      silhouetteIou: record.asset.inspection.silhouetteIou,
    },
  }
  if (record.asset.contentSha256 !== actualHash || record.asset.byteLength !== glb.byteLength) {
    throw new Error('mesh-publish-quarantine-content-changed')
  }
  const authorization = JSON.parse(
    await readFile(rightsFile, 'utf8')
  ) as ProductMeshSourceAuthorization
  const review = JSON.parse(await readFile(reviewFile, 'utf8')) as ProductMeshHumanReview
  const publication = publishGeneratedProductMesh(product, asset, authorization, review)
  if (!publication.published) {
    throw new Error(`mesh-publish-gate-rejected:${publication.reasons.join(',')}`)
  }

  await mkdir(publicRoot, { recursive: true })
  const publicFile = resolveInside(publicRoot, path.resolve(publicRoot, `${actualHash}.glb`))
  if (await exists(publicFile)) {
    const existingHash = createHash('sha256')
      .update(await readFile(publicFile))
      .digest('hex')
    if (existingHash !== actualHash) throw new Error('mesh-publish-content-address-collision')
  } else {
    const temp = `${publicFile}.${process.pid}.tmp`
    await writeFile(temp, glb)
    await rename(temp, publicFile)
  }

  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as {
    schemaVersion: 2
    generatedAt?: string
    assets: ApprovedProductMesh[]
  }
  const duplicate = manifest.assets.find(
    (entry) => entry.assetId === publication.asset.assetId || entry.productId === product.id
  )
  if (duplicate && duplicate.sha256 !== publication.asset.sha256) {
    throw new Error('mesh-publish-active-product-duplicate')
  }
  if (!duplicate) manifest.assets.push(publication.asset)
  manifest.generatedAt = new Date().toISOString()
  manifest.assets.sort((left, right) => left.productId.localeCompare(right.productId))
  const manifestTemp = `${manifestFile}.${process.pid}.tmp`
  await writeFile(manifestTemp, `${JSON.stringify(manifest, null, 2)}\n`)
  await rename(manifestTemp, manifestFile)

  const recordTemp = `${recordFile}.${process.pid}.tmp`
  await writeFile(
    recordTemp,
    `${JSON.stringify({ ...record, status: 'published', publication: publication.asset }, null, 2)}\n`
  )
  await rename(recordTemp, recordFile)
  console.log(JSON.stringify(publication.asset, null, 2))
} finally {
  await unlink(lockFile).catch(() => undefined)
}

function parseArgs(values: string[]): Map<string, string> {
  const result = new Map<string, string>()
  for (let index = 0; index < values.length; index += 2) {
    if (values[index] && values[index + 1]) result.set(values[index], values[index + 1])
  }
  return result
}

function required(args: Map<string, string>, key: string): string {
  const value = args.get(key)
  if (!value) throw new Error(`mesh-publish-argument-required:${key}`)
  return value
}

function resolveInside(root: string, target: string): string {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedRoot, resolvedTarget)
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('mesh-publish-path-outside-root')
  return resolvedTarget
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}
