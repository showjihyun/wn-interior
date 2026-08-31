import { buildProductMeshFingerprint } from '../src/application/generatedMeshLifecycle'
import { StaticProductCatalog } from '../src/infrastructure/reference-data/StaticReferenceData'

const index = process.argv.indexOf('--product')
const productId = index >= 0 ? process.argv[index + 1] : undefined
if (!productId || process.argv.includes('--help')) {
  console.log('사용법: npm run mesh:fingerprint -- --product <catalog-product-id>')
  process.exit(productId ? 0 : 1)
}
const product = new StaticProductCatalog().findById(productId)
if (!product) throw new Error(`mesh-fingerprint-product-not-found:${productId}`)
console.log(buildProductMeshFingerprint(product))
