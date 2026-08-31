export interface CatalogSheetConfig {
  catalog: {
    id: string
    provider: string
    locale: 'ko-KR'
    generatedAt: string
  }
  defaults?: Record<string, string | number | boolean>
}

export function parseCatalogCsv(
  csv: string,
  config: CatalogSheetConfig,
  delimiter = ','
): Record<string, unknown> {
  const table: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) table.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  row.push(cell)
  if (row.some((value) => value.trim())) table.push(row)
  const headers = (table.shift() ?? []).map((value, index) =>
    (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim()
  )
  const rows = table.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']))
  )
  return catalogRowsToProtocol(rows, config)
}

export function catalogRowsToProtocol(
  rows: Array<Record<string, unknown>>,
  config: CatalogSheetConfig
): Record<string, unknown> {
  const value = (row: Record<string, unknown>, key: string): unknown => {
    const current = row[key]
    return current === undefined || current === null || String(current).trim() === ''
      ? config.defaults?.[key]
      : current
  }
  const string = (row: Record<string, unknown>, key: string): string | undefined => {
    const current = value(row, key)
    return current === undefined || current === null || String(current).trim() === ''
      ? undefined
      : String(current).trim()
  }
  const number = (row: Record<string, unknown>, key: string): number | undefined => {
    const current = value(row, key)
    if (current === undefined || current === null || String(current).trim() === '') return undefined
    const parsed =
      typeof current === 'number' ? current : Number(String(current ?? '').replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const list = (row: Record<string, unknown>, key: string): string[] =>
    (string(row, key) ?? '')
      .split('|')
      .map((item) => item.trim())
      .filter((item, index, items) => !!item && items.indexOf(item) === index)
  const boolean = (row: Record<string, unknown>, key: string): boolean | undefined => {
    const current = value(row, key)
    if (typeof current === 'boolean') return current
    const normalized = String(current ?? '')
      .trim()
      .toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
    return undefined
  }

  return {
    protocol: 'homeplan.catalog',
    version: '1.0',
    catalog: config.catalog,
    products: rows.map((row) => {
      const priceAmount = number(row, 'price_amount')
      const images = list(row, 'images')
      const requiresAll = list(row, 'requires_all')
      const requiresAny = list(row, 'requires_any')
      const supportedBy = list(row, 'surface_supported_by')
      const colorways = list(row, 'colorways')
      return {
        externalId: string(row, 'external_id'),
        name: string(row, 'name'),
        brand: string(row, 'brand'),
        sku: string(row, 'sku'),
        classification: {
          category: string(row, 'category'),
          tags: list(row, 'tags'),
        },
        dimensions: {
          width: number(row, 'width'),
          depth: number(row, 'depth'),
          height: number(row, 'height'),
          unit: string(row, 'unit'),
        },
        price:
          priceAmount !== undefined
            ? {
                amount: priceAmount,
                currency: string(row, 'price_currency') ?? 'KRW',
                checkedAt: string(row, 'price_checked_at'),
                basis: string(row, 'price_basis'),
                included: list(row, 'included'),
                excluded: list(row, 'excluded'),
              }
            : undefined,
        source: {
          url: string(row, 'source_url'),
          retrievedAt: string(row, 'retrieved_at'),
        },
        materials: list(row, 'materials'),
        assets: images.map((url) => ({ kind: 'image', role: 'product', url })),
        render: {
          shapeHint: string(row, 'shape_hint'),
          colorways,
        },
        installation: {
          mount: string(row, 'mount'),
          snapToWall: boolean(row, 'snap_to_wall'),
          defaultElevation: number(row, 'default_elevation'),
          provides: list(row, 'provides'),
          requires:
            requiresAll.length || requiresAny.length
              ? {
                  allOf: requiresAll,
                  anyOf: requiresAny,
                  scope: string(row, 'dependency_scope') ?? 'support-chain',
                }
              : undefined,
          surface: supportedBy.length
            ? {
                supportedBy,
                anchor: string(row, 'surface_anchor') ?? 'rear',
              }
            : undefined,
        },
      }
    }),
  }
}
