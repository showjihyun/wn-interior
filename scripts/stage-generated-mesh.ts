import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildProductMeshFingerprint,
  createStageGeneratedProductMesh,
  type ProductMeshSourceAuthorization,
} from '../src/application/generatedMeshLifecycle'
import { HttpGeneratedMeshWorker } from '../src/infrastructure/generated-mesh/HttpGeneratedMeshWorker'
import {
  FileGeneratedMeshQuarantine,
  FileProductImageAssetSource,
  GlbGeneratedMeshInspector,
} from '../src/infrastructure/generated-mesh/OfflineGeneratedMeshAdapters'
import { StaticProductCatalog } from '../src/infrastructure/reference-data/StaticReferenceData'

const args = new Map<string, string>()
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  const value = process.argv[index + 1]
  if (key && value) args.set(key, value)
}
if (process.argv.includes('--help')) {
  console.log(
    '사용법: npm run mesh:stage -- --product <id> --worker-url <local-url> --rights <json>'
  )
  process.exit(0)
}
const productId = args.get('--product')
const workerUrl = args.get('--worker-url')
const rightsFile = args.get('--rights')
if (!productId || !workerUrl || !rightsFile) throw new Error('mesh-stage-arguments-required')

const products = new StaticProductCatalog()
const product = products.findById(productId)
if (!product) throw new Error(`mesh-stage-product-not-found:${productId}`)
const authorization = JSON.parse(
  await readFile(path.resolve(rightsFile), 'utf8')
) as ProductMeshSourceAuthorization
const expectedFingerprint = buildProductMeshFingerprint(product)
if (authorization.productFingerprint !== expectedFingerprint) {
  throw new Error(`mesh-stage-rights-fingerprint-mismatch:${expectedFingerprint}`)
}

const stage = createStageGeneratedProductMesh({
  imageSource: new FileProductImageAssetSource(path.resolve('public')),
  worker: new HttpGeneratedMeshWorker(workerUrl),
  inspector: new GlbGeneratedMeshInspector(),
  quarantine: new FileGeneratedMeshQuarantine(
    path.resolve('artifacts', 'generated-mesh', 'quarantine')
  ),
})
const result = await stage.execute({
  jobId: `mesh-${product.id}-${Date.now()}`,
  product,
  authorization,
})
console.log(JSON.stringify(result, null, 2))
if (result.status !== 'quarantined') process.exitCode = 1
