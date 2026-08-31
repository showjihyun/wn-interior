export interface WebProductAdapterIssue {
  code: string
  path: string
  message: string
}

export interface WebProductAdapterInput {
  source: string | Record<string, unknown>
  sourceUrl: string
  catalog: {
    id: string
    provider: string
    locale: 'ko-KR'
    generatedAt: string
  }
  overrides: Record<string, unknown>
}

export class InvalidWebProductSourceError extends Error {
  constructor(readonly issues: WebProductAdapterIssue[]) {
    super('invalid-web-product-source')
    this.name = 'InvalidWebProductSourceError'
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const decodeHtml = (value: string): string =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')

function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      'i'
    ),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return decodeHtml(match[1].trim())
  }
  return null
}

function isProduct(value: unknown): value is Record<string, unknown> {
  if (!record(value)) return false
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']]
  return types.some(
    (candidate) => candidate === 'Product' || candidate === 'https://schema.org/Product'
  )
}

function findProduct(value: unknown): Record<string, unknown> | null {
  if (isProduct(value)) return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const product = findProduct(item)
      if (product) return product
    }
  }
  if (record(value) && Array.isArray(value['@graph'])) return findProduct(value['@graph'])
  return null
}

function extractProductFromHtml(html: string): Record<string, unknown> {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )
  for (const match of scripts) {
    try {
      const product = findProduct(JSON.parse(match[1]) as unknown)
      if (product) return product
    } catch {
      // A broken JSON-LD block does not hide a later valid block or OpenGraph fallback.
    }
  }
  return {
    '@type': 'Product',
    name: metaContent(html, 'og:title'),
    image: metaContent(html, 'og:image'),
    offers: {
      '@type': 'Offer',
      price: metaContent(html, 'product:price:amount'),
      priceCurrency: metaContent(html, 'product:price:currency'),
    },
  }
}

function sourceProduct(source: WebProductAdapterInput['source']): Record<string, unknown> {
  if (record(source)) return findProduct(source) ?? source
  const trimmed = source.trim()
  if (trimmed.startsWith('<')) return extractProductFromHtml(trimmed)
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return findProduct(parsed) ?? (record(parsed) ? parsed : {})
  } catch {
    return extractProductFromHtml(trimmed)
  }
}

function brandName(value: unknown): string | null {
  if (typeof value === 'string') return text(value)
  return record(value) ? text(value.name) : null
}

function firstOffer(value: unknown): Record<string, unknown> {
  const offer = Array.isArray(value) ? value[0] : value
  return record(offer) ? offer : {}
}

function imageUrls(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values
    .map((item) => (record(item) ? text(item.url ?? item.contentUrl) : text(item)))
    .filter((item): item is string => !!item && /^https:\/\//i.test(item))
}

function materials(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return values.map(text).filter((item): item is string => !!item)
}

const SCHEMA_UNITS: Record<string, 'mm' | 'cm' | 'm'> = {
  MMT: 'mm',
  CMT: 'cm',
  MTR: 'm',
  mm: 'mm',
  cm: 'cm',
  m: 'm',
}

function quantity(value: unknown): { value: number; unit: 'mm' | 'cm' | 'm' } | null {
  if (typeof value === 'string') {
    const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(mm|cm|m)$/i)
    return match
      ? { value: Number(match[1]), unit: match[2].toLowerCase() as 'mm' | 'cm' | 'm' }
      : null
  }
  if (!record(value)) return null
  const numeric = typeof value.value === 'number' ? value.value : Number(value.value)
  const unit = SCHEMA_UNITS[String(value.unitCode ?? value.unitText ?? '')]
  return Number.isFinite(numeric) && numeric > 0 && unit ? { value: numeric, unit } : null
}

function dimensionsOf(
  product: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> | null {
  if (record(overrides.dimensions)) return overrides.dimensions
  const width = quantity(product.width)
  const depth = quantity(product.depth)
  const height = quantity(product.height)
  if (!width || !depth || !height) return null
  const toMm = (item: NonNullable<ReturnType<typeof quantity>>) =>
    item.value * (item.unit === 'mm' ? 1 : item.unit === 'cm' ? 10 : 1000)
  return {
    width: toMm(width),
    depth: toMm(depth),
    height: toMm(height),
    unit: 'mm',
  }
}

export function adaptWebProductSource(input: WebProductAdapterInput): Record<string, unknown> {
  const product = sourceProduct(input.source)
  const overrides = input.overrides
  const offer = firstOffer(overrides.offer ?? product.offers)
  const dimensions = dimensionsOf(product, overrides)
  const externalId =
    text(overrides.externalId) ??
    text(overrides.sku) ??
    text(product.sku) ??
    text(product.productID) ??
    text(product.mpn)
  const name = text(overrides.name) ?? text(product.name)
  const brand = text(overrides.brand) ?? brandName(product.brand) ?? input.catalog.provider
  const issues: WebProductAdapterIssue[] = []
  if (!externalId)
    issues.push({
      code: 'external-id-missing',
      path: '$.externalId',
      message: 'sku/productID/mpn or override required',
    })
  if (!name) issues.push({ code: 'name-missing', path: '$.name', message: 'product name required' })
  if (!dimensions)
    issues.push({
      code: 'dimension-missing',
      path: '$.dimensions',
      message: 'width/depth/height or override required',
    })
  if (!record(overrides.classification))
    issues.push({
      code: 'classification-missing',
      path: '$.classification',
      message: 'taxonomy override required',
    })
  if (!record(overrides.installation))
    issues.push({
      code: 'installation-missing',
      path: '$.installation',
      message: 'installation override required',
    })
  if (issues.length) throw new InvalidWebProductSourceError(issues)

  const priceValue = Number(overrides.price ?? offer.price)
  const priceCurrency = text(overrides.currency) ?? text(offer.priceCurrency)
  const priceBasis = text(overrides.priceBasis)
  const checkedAt = text(overrides.checkedAt)
  const images = [...new Set([...imageUrls(product.image), ...imageUrls(overrides.images)])]
  const sourceUrl = text(offer.url) ?? input.sourceUrl

  return {
    protocol: 'homeplan.catalog',
    version: '1.0',
    catalog: input.catalog,
    products: [
      {
        externalId,
        name,
        brand,
        sku: text(overrides.sku) ?? text(product.sku) ?? undefined,
        classification: overrides.classification,
        dimensions,
        price:
          Number.isFinite(priceValue) &&
          priceValue > 0 &&
          priceCurrency === 'KRW' &&
          priceBasis &&
          checkedAt
            ? {
                amount: Math.round(priceValue),
                currency: 'KRW',
                checkedAt,
                basis: priceBasis,
                included: overrides.included,
                excluded: overrides.excluded,
              }
            : undefined,
        source: {
          url: sourceUrl,
          retrievedAt: text(overrides.retrievedAt) ?? input.catalog.generatedAt,
        },
        materials: materials(overrides.materials ?? product.material),
        assets: images.map((url) => ({ kind: 'image', role: 'product', url })),
        render: overrides.render,
        installation: overrides.installation,
      },
    ],
  }
}
