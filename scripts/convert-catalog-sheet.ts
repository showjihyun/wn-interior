import { readFileSync, writeFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { importCatalogProtocol } from '../src/application/catalogProtocol'
import {
  catalogRowsToProtocol,
  parseCatalogCsv,
  type CatalogSheetConfig,
} from '../src/infrastructure/catalog-import/catalogSpreadsheetBridge'

const args = process.argv.slice(2)
const valueOf = (name: string) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const inputPath = valueOf('--input')
const configPath = valueOf('--config')
const outputPath = valueOf('--output')
const sheet = valueOf('--sheet') ?? 'products'
if (!inputPath || !configPath || !outputPath) {
  throw new Error(
    'usage: npm run catalog:convert-sheet -- --input catalog.xlsx --config sheet.json --output catalog.json'
  )
}

const config = JSON.parse(readFileSync(resolve(configPath), 'utf8')) as CatalogSheetConfig
const extension = extname(inputPath).toLowerCase()
let feed: Record<string, unknown>
if (extension === '.csv' || extension === '.tsv') {
  feed = parseCatalogCsv(
    readFileSync(resolve(inputPath), 'utf8'),
    config,
    extension === '.tsv' ? '\t' : ','
  )
} else if (extension === '.xlsx') {
  const result = spawnSync(
    'python',
    [resolve('scripts/read_catalog_workbook.py'), resolve(inputPath), '--sheet', sheet],
    {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    }
  )
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'xlsx-read-failed').trim())
  }
  feed = catalogRowsToProtocol(JSON.parse(result.stdout) as Array<Record<string, unknown>>, config)
} else throw new Error(`unsupported-sheet-extension:${extension}`)

const normalized = importCatalogProtocol(feed)
writeFileSync(resolve(outputPath), `${JSON.stringify(feed, null, 2)}\n`, 'utf8')
console.log(
  `Catalog sheet 변환 통과: ${normalized.provider}·${normalized.products.length}개 상품 → ${resolve(outputPath)}`
)
