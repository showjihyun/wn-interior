import {
  catalogRowsToProtocol,
  parseCatalogCsvRows,
  type CatalogSheetConfig,
} from './catalogSpreadsheetBridge'

export class UnsupportedCatalogFileError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'UnsupportedCatalogFileError'
  }
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const PRESETS = {
  hanssem: {
    aliases: ['한샘', 'hanssem'],
    catalogId: 'hanssem-ko',
    provider: 'Hanssem',
    brand: '한샘',
  },
  livart: {
    aliases: ['리바트', '현대리바트', 'livart', 'hyundai livart'],
    catalogId: 'hyundai-livart-ko',
    provider: 'Hyundai Livart',
    brand: '리바트',
  },
} as const

const readBlob = (file: Blob, mode: 'text' | 'buffer'): Promise<string | ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new UnsupportedCatalogFileError('spreadsheet-read-failed'))
    reader.onload = () => resolve(reader.result as string | ArrayBuffer)
    if (mode === 'text') reader.readAsText(file, 'utf-8')
    else reader.readAsArrayBuffer(file)
  })

function tableToRows(table: unknown[][]): Array<Record<string, unknown>> {
  if (!table.length) throw new UnsupportedCatalogFileError('spreadsheet-empty')
  const headers = table[0].map((value, index) =>
    (index === 0 ? String(value ?? '').replace(/^\uFEFF/, '') : String(value ?? '')).trim()
  )
  if (!headers.includes('external_id') || !headers.includes('brand')) {
    throw new UnsupportedCatalogFileError('spreadsheet-columns-invalid')
  }
  return table.slice(1).flatMap((values) => {
    if (!values.some((value) => value !== null && value !== undefined && String(value).trim())) {
      return []
    }
    return [
      Object.fromEntries(
        headers.flatMap((header, index) => {
          if (!header) return []
          const raw = values[index]
          return [[header, raw instanceof Date ? raw.toISOString() : (raw ?? '')]]
        })
      ),
    ]
  })
}

function presetForRows(rows: Array<Record<string, unknown>>, fileName: string) {
  const declaredBrands = [
    ...new Set(
      rows
        .map((row) =>
          String(row.brand ?? '')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
        .map((brand) => {
          const match = Object.values(PRESETS).find((preset) =>
            preset.aliases.includes(brand as never)
          )
          return match?.catalogId ?? `unsupported:${brand}`
        })
    ),
  ]
  if (declaredBrands.length > 1) {
    throw new UnsupportedCatalogFileError('spreadsheet-brand-mixed')
  }
  const declared = declaredBrands[0]
  const normalizedName = fileName.toLowerCase()
  const preset = Object.values(PRESETS).find(
    (candidate) =>
      candidate.catalogId === declared ||
      candidate.aliases.some((alias) => normalizedName.includes(alias.toLowerCase()))
  )
  if (!preset || declared?.startsWith('unsupported:')) {
    throw new UnsupportedCatalogFileError('spreadsheet-brand-unsupported')
  }
  return preset
}

async function readXlsxRows(file: File): Promise<Array<Record<string, unknown>>> {
  const buffer = (await readBlob(file, 'buffer')) as ArrayBuffer
  try {
    const [{ unzipSync }, { readSheet }] = await Promise.all([
      import('fflate'),
      import('read-excel-file/browser'),
    ])
    const archive = unzipSync(new Uint8Array(buffer))
    const decoder = new TextDecoder()
    const hasFormula = Object.entries(archive).some(
      ([path, bytes]) =>
        path.startsWith('xl/worksheets/') && /<f(?:\s[^>]*)?\/?>/.test(decoder.decode(bytes))
    )
    if (hasFormula) throw new UnsupportedCatalogFileError('spreadsheet-formula-unsupported')
    return tableToRows((await readSheet(buffer, 'products')) as unknown[][])
  } catch (error) {
    if (error instanceof UnsupportedCatalogFileError) throw error
    throw new UnsupportedCatalogFileError('spreadsheet-xlsx-invalid')
  }
}

export async function catalogFileToProtocol(
  file: File,
  now: () => Date = () => new Date()
): Promise<Record<string, unknown>> {
  if (file.size > MAX_FILE_BYTES)
    throw new UnsupportedCatalogFileError('spreadsheet-file-too-large')
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0]
  let rows: Array<Record<string, unknown>>
  if (extension === '.csv' || extension === '.tsv') {
    rows = parseCatalogCsvRows(
      (await readBlob(file, 'text')) as string,
      extension === '.tsv' ? '\t' : ','
    )
  } else if (extension === '.xlsx') rows = await readXlsxRows(file)
  else throw new UnsupportedCatalogFileError('spreadsheet-extension-unsupported')
  if (!rows.length) throw new UnsupportedCatalogFileError('spreadsheet-empty')
  if (!('external_id' in rows[0]) || !('brand' in rows[0])) {
    throw new UnsupportedCatalogFileError('spreadsheet-columns-invalid')
  }

  const preset = presetForRows(rows, file.name)
  const config: CatalogSheetConfig = {
    catalog: {
      id: preset.catalogId,
      provider: preset.provider,
      locale: 'ko-KR',
      generatedAt: now().toISOString(),
    },
    defaults: { brand: preset.brand, unit: 'mm', mount: 'floor' },
  }
  return catalogRowsToProtocol(rows, config)
}
