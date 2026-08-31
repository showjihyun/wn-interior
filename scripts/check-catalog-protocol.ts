import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { importCatalogProtocol } from '../src/application/catalogProtocol'
import { adaptWebProductSource } from '../src/infrastructure/catalog-import/webProductAdapter'

const root = resolve(import.meta.dirname, '..')
const schema = JSON.parse(
  readFileSync(resolve(root, 'schemas/homeplan-catalog-v1.schema.json'), 'utf8')
) as { $id?: string; properties?: Record<string, unknown> }

if (schema.$id !== 'https://homeplan3d.dev/schemas/catalog-1.0.json') {
  throw new Error('catalog protocol schema id mismatch')
}

const examples = [
  'schemas/examples/livart-sofa.catalog.json',
  'schemas/examples/ikea-kitchen-chain.catalog.json',
]
const counts = examples.map((file) => {
  const document = readFileSync(resolve(root, file), 'utf8')
  return importCatalogProtocol(document).products.length
})

if (counts[0] !== 1 || counts[1] !== 3) {
  throw new Error(`catalog protocol example count mismatch: ${counts.join(',')}`)
}

const adapterConfig = JSON.parse(
  readFileSync(resolve(root, 'schemas/examples/livart-sofa.adapter.json'), 'utf8')
) as {
  sourceUrl: string
  catalog: { id: string; provider: string; locale: 'ko-KR'; generatedAt: string }
  overrides: Record<string, unknown>
}
const adapted = importCatalogProtocol(
  adaptWebProductSource({
    source: readFileSync(resolve(root, 'schemas/examples/livart-sofa.page.html'), 'utf8'),
    sourceUrl: adapterConfig.sourceUrl,
    catalog: adapterConfig.catalog,
    overrides: adapterConfig.overrides,
  })
)
if (adapted.products[0]?.dims.w !== 3000 || adapted.products[0]?.price !== 2237000) {
  throw new Error('web product adapter conformance mismatch')
}

console.log(
  `Catalog Protocol 1.0 conformance 통과: ${examples.length}개 feed·${counts.reduce((a, b) => a + b, 0)}개 상품·web adapter 1개`
)
