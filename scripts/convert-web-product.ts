import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { importCatalogProtocol } from '../src/application/catalogProtocol'
import { adaptWebProductSource } from '../src/infrastructure/catalog-import/webProductAdapter'

const args = process.argv.slice(2)
const valueOf = (name: string) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const inputPath = valueOf('--input')
const configPath = valueOf('--config')
const outputPath = valueOf('--output')

if (!inputPath || !configPath || !outputPath) {
  throw new Error(
    'usage: npm run catalog:convert-web -- --input page.html --config adapter.json --output catalog.json'
  )
}

const source = readFileSync(resolve(inputPath), 'utf8')
const config = JSON.parse(readFileSync(resolve(configPath), 'utf8')) as {
  sourceUrl: string
  catalog: { id: string; provider: string; locale: 'ko-KR'; generatedAt: string }
  overrides: Record<string, unknown>
}
const feed = adaptWebProductSource({
  source,
  sourceUrl: config.sourceUrl,
  catalog: config.catalog,
  overrides: config.overrides,
})
const normalized = importCatalogProtocol(feed)

writeFileSync(resolve(outputPath), `${JSON.stringify(feed, null, 2)}\n`, 'utf8')
console.log(
  `Catalog adapter 변환 통과: ${normalized.provider}·${normalized.products.length}개 상품 → ${resolve(outputPath)}`
)
