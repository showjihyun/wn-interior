import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { importCatalogProtocol } from '../src/application/catalogProtocol'
import {
  catalogRowsToProtocol,
  parseCatalogCsv,
  type CatalogSheetConfig,
} from '../src/infrastructure/catalog-import/catalogSpreadsheetBridge'

const root = resolve(import.meta.dirname, '..')
const brands = ['hanssem', 'livart'] as const

for (const brand of brands) {
  const config = JSON.parse(
    readFileSync(resolve(root, `schemas/templates/${brand}-sheet.config.json`), 'utf8')
  ) as CatalogSheetConfig
  const csvFeed = parseCatalogCsv(
    readFileSync(resolve(root, `schemas/templates/${brand}-catalog-template.csv`), 'utf8'),
    config
  )
  const workbook = spawnSync(
    'python',
    [
      resolve(root, 'scripts/read_catalog_workbook.py'),
      resolve(root, `schemas/templates/${brand}-catalog-template.xlsx`),
      '--sheet',
      'products',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    }
  )
  if (workbook.status !== 0) {
    throw new Error((workbook.stderr || workbook.stdout || `${brand}-xlsx-read-failed`).trim())
  }
  const xlsxFeed = catalogRowsToProtocol(
    JSON.parse(workbook.stdout) as Array<Record<string, unknown>>,
    config
  )
  const csv = importCatalogProtocol(csvFeed)
  const xlsx = importCatalogProtocol(xlsxFeed)
  if (csv.products.length !== 1 || xlsx.products.length !== 1) {
    throw new Error(`${brand}-template-product-count-mismatch`)
  }
  if (JSON.stringify(csvFeed) !== JSON.stringify(xlsxFeed)) {
    throw new Error(`${brand}-csv-xlsx-parity-mismatch`)
  }

  const override = JSON.parse(
    readFileSync(resolve(root, `schemas/templates/${brand}-web-override.template.json`), 'utf8')
  ) as { sourceUrl?: unknown; overrides?: Record<string, unknown> }
  if (
    typeof override.sourceUrl !== 'string' ||
    !override.sourceUrl.startsWith('https://') ||
    !override.overrides?.dimensions ||
    !override.overrides.installation
  ) {
    throw new Error(`${brand}-web-override-template-invalid`)
  }
}

console.log('Catalog template conformance 통과: 한샘·리바트 CSV/XLSX 동등성 + web override')
