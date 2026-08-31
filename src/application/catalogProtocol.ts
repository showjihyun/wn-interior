import type { CategoryId, Mount, Product, ShapeKind } from '../domain/model'

export interface CatalogProtocolIssue {
  severity: 'error' | 'warning'
  code: string
  path: string
  message: string
}

export interface CatalogProtocolImportResult {
  catalogId: string
  provider: string
  products: Product[]
  issues: CatalogProtocolIssue[]
}

export class InvalidCatalogProtocolError extends Error {
  constructor(readonly issues: CatalogProtocolIssue[]) {
    super('invalid-catalog-protocol')
    this.name = 'InvalidCatalogProtocolError'
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const finitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const HTTPS_URL = /^https:\/\//i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CAPABILITY = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/
const COLORS = /^#[0-9a-f]{6}$/i

const SHAPES = new Set<ShapeKind>([
  'box',
  'sofa3',
  'kivikSofa',
  'armchair',
  'coffeeTable',
  'shelfCoffeeTable',
  'diningTable',
  'gatelegTable',
  'chair',
  'bed',
  'highBedFrame',
  'wardrobe',
  'modularWardrobe',
  'openBookcase',
  'dresser',
  'sideTable',
  'tvStand',
  'tvWall',
  'sinkLower',
  'sinkUpper',
  'fridge',
  'rug',
  'shoeCabinet',
  'desk',
  'shelfWall',
  'washer',
  'ac',
  'pendant',
  'floorLamp',
  'tableGlobeLamp',
  'toilet',
  'washbasin',
  'mirror',
  'microwave',
  'islandBar',
  'robotVacuum',
  'airPurifier',
  'tvOled',
  'curtain',
  'blind',
  'inductionHob',
  'faucet',
  'kitchenSink',
])

const CATEGORY_MAP: Record<string, CategoryId> = {
  'seating.sofa': 'living',
  'seating.chair': 'living',
  'table.coffee': 'living',
  'table.dining': 'living',
  'bed.frame': 'bedroom',
  'storage.wardrobe': 'storage',
  'storage.bookcase': 'storage',
  'storage.built-in': 'built-in',
  'kitchen.base-cabinet': 'kitchen',
  'kitchen.wall-cabinet': 'kitchen',
  'kitchen.sink': 'kitchen',
  'kitchen.faucet': 'kitchen',
  'kitchen.appliance': 'appliance',
  appliance: 'appliance',
  lighting: 'lighting',
  bathroom: 'bath',
  curtain: 'living',
  'finish.wallcovering': 'wall-finish',
  'finish.flooring': 'flooring',
}

const unitScale = (unit: unknown): number | null =>
  unit === 'mm' ? 1 : unit === 'cm' ? 10 : unit === 'm' ? 1000 : null

const stringList = (
  value: unknown,
  path: string,
  issues: CatalogProtocolIssue[],
  validator?: (item: string) => boolean
): string[] => {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    issues.push({ severity: 'error', code: 'array-invalid', path, message: 'array required' })
    return []
  }
  const result: string[] = []
  value.forEach((item, index) => {
    const normalized = text(item)
    if (!normalized || (validator && !validator(normalized))) {
      issues.push({
        severity: 'error',
        code: 'value-invalid',
        path: `${path}[${index}]`,
        message: 'invalid string value',
      })
    } else if (!result.includes(normalized)) result.push(normalized)
  })
  return result
}

export function importCatalogProtocol(input: unknown): CatalogProtocolImportResult {
  if (typeof input === 'string') {
    try {
      return importCatalogProtocol(JSON.parse(input) as unknown)
    } catch (error) {
      if (error instanceof InvalidCatalogProtocolError) throw error
      throw new InvalidCatalogProtocolError([
        {
          severity: 'error',
          code: 'json-invalid',
          path: '$',
          message: 'valid JSON required',
        },
      ])
    }
  }
  const issues: CatalogProtocolIssue[] = []
  const error = (code: string, path: string, message: string) =>
    issues.push({ severity: 'error', code, path, message })
  const warning = (code: string, path: string, message: string) =>
    issues.push({ severity: 'warning', code, path, message })

  if (!record(input))
    throw new InvalidCatalogProtocolError([
      { severity: 'error', code: 'document-invalid', path: '$', message: 'object required' },
    ])
  if (input.protocol !== 'homeplan.catalog')
    error('protocol-invalid', '$.protocol', 'homeplan.catalog required')
  if (input.version !== '1.0')
    error('version-unsupported', '$.version', 'only version 1.0 is supported')
  const catalog = record(input.catalog) ? input.catalog : {}
  const catalogId = text(catalog.id)
  const provider = text(catalog.provider)
  if (!catalogId || !ID.test(catalogId))
    error('catalog-id-invalid', '$.catalog.id', 'stable catalog id required')
  if (!provider) error('provider-invalid', '$.catalog.provider', 'provider required')
  if (catalog.locale !== 'ko-KR')
    error('locale-unsupported', '$.catalog.locale', 'ko-KR required in v1')
  if (!text(catalog.generatedAt) || Number.isNaN(Date.parse(String(catalog.generatedAt)))) {
    error('generated-at-invalid', '$.catalog.generatedAt', 'ISO date-time required')
  }
  const rawProducts = Array.isArray(input.products) ? input.products : []
  if (!Array.isArray(input.products) || rawProducts.length === 0) {
    error('products-invalid', '$.products', 'non-empty product array required')
  }

  const seen = new Set<string>()
  const products: Product[] = []
  rawProducts.forEach((raw, index) => {
    const path = `$.products[${index}]`
    if (!record(raw)) {
      error('product-invalid', path, 'object required')
      return
    }
    const externalId = text(raw.externalId)
    const name = text(raw.name)
    const brand = text(raw.brand)
    if (!externalId || !ID.test(externalId))
      error('external-id-invalid', `${path}.externalId`, 'stable external id required')
    else if (seen.has(externalId))
      error('duplicate-external-id', `${path}.externalId`, 'duplicate external id')
    else seen.add(externalId)
    if (!name) error('name-invalid', `${path}.name`, 'name required')
    if (!brand) error('brand-invalid', `${path}.brand`, 'brand required')

    const classification = record(raw.classification) ? raw.classification : {}
    const taxonomy = text(classification.category)
    const category = taxonomy ? CATEGORY_MAP[taxonomy] : undefined
    if (!taxonomy || !category)
      error(
        'category-unsupported',
        `${path}.classification.category`,
        'supported taxonomy required'
      )
    const tags = stringList(classification.tags, `${path}.classification.tags`, issues)

    const dimensions = record(raw.dimensions) ? raw.dimensions : {}
    const scale = unitScale(dimensions.unit)
    if (!scale) error('unit-unsupported', `${path}.dimensions.unit`, 'mm, cm or m required')
    const dimension = (key: 'width' | 'depth' | 'height') => {
      const value = dimensions[key]
      if (!finitePositive(value)) {
        error(
          'dimension-invalid',
          `${path}.dimensions.${key}`,
          'positive finite dimension required'
        )
        return 0
      }
      return Math.round(value * (scale ?? 1))
    }
    const dims = { w: dimension('width'), d: dimension('depth'), h: dimension('height') }

    const source = record(raw.source) ? raw.source : {}
    const sourceUrl = text(source.url)
    const retrievedAt = text(source.retrievedAt)
    if (!sourceUrl || !HTTPS_URL.test(sourceUrl))
      error('source-url-invalid', `${path}.source.url`, 'HTTPS source URL required')
    if (!retrievedAt || Number.isNaN(Date.parse(retrievedAt)))
      error('retrieved-at-invalid', `${path}.source.retrievedAt`, 'ISO date-time required')

    const render = record(raw.render) ? raw.render : {}
    const rawShape = text(render.shapeHint)
    const shape = rawShape && SHAPES.has(rawShape as ShapeKind) ? (rawShape as ShapeKind) : 'box'
    if (!rawShape) warning('shape-fallback', `${path}.render.shapeHint`, 'box fallback applied')
    else if (!SHAPES.has(rawShape as ShapeKind))
      warning(
        'shape-fallback',
        `${path}.render.shapeHint`,
        `unsupported shape ${rawShape}; box fallback applied`
      )
    const colorways = stringList(render.colorways, `${path}.render.colorways`, issues, (item) =>
      COLORS.test(item)
    )

    const installation = record(raw.installation) ? raw.installation : {}
    const rawMount = text(installation.mount)
    const mount: Mount = ['floor', 'wall-mount', 'ceiling', 'wall', 'surface'].includes(
      rawMount ?? ''
    )
      ? (rawMount as Mount)
      : 'floor'
    if (!rawMount) error('mount-invalid', `${path}.installation.mount`, 'mount required')
    else if (mount !== rawMount)
      error('mount-invalid', `${path}.installation.mount`, 'unsupported mount')
    const snapToWall =
      typeof installation.snapToWall === 'boolean' ? installation.snapToWall : undefined
    const defaultElevation = finitePositive(installation.defaultElevation)
      ? installation.defaultElevation
      : undefined
    const provides = stringList(
      installation.provides,
      `${path}.installation.provides`,
      issues,
      (item) => CAPABILITY.test(item)
    )
    const requiresRaw = record(installation.requires) ? installation.requires : undefined
    const allOf = requiresRaw
      ? stringList(requiresRaw.allOf, `${path}.installation.requires.allOf`, issues, (item) =>
          CAPABILITY.test(item)
        )
      : []
    const anyOf = requiresRaw
      ? stringList(requiresRaw.anyOf, `${path}.installation.requires.anyOf`, issues, (item) =>
          CAPABILITY.test(item)
        )
      : []
    const scope = requiresRaw?.scope === 'project' ? 'project' : 'support-chain'
    const surfaceRaw = record(installation.surface) ? installation.surface : undefined
    const supportedBy = surfaceRaw
      ? stringList(
          surfaceRaw.supportedBy,
          `${path}.installation.surface.supportedBy`,
          issues,
          (item) => CAPABILITY.test(item)
        )
      : []
    if (mount === 'surface' && !supportedBy.length) {
      error(
        'surface-support-required',
        `${path}.installation.surface.supportedBy`,
        'surface mount requires at least one support capability'
      )
    }

    const materials = stringList(raw.materials, `${path}.materials`, issues)
    const assets = Array.isArray(raw.assets) ? raw.assets : []
    const sourceImageUrls = assets
      .map((asset) => (record(asset) ? text(asset.url) : null))
      .filter((url): url is string => !!url && HTTPS_URL.test(url))
    const protocolVariants: NonNullable<Product['catalog']>['variants'] = []
    const dimensionVariants: NonNullable<Product['dimensionVariants']> = []
    if (raw.variants !== undefined && !Array.isArray(raw.variants)) {
      error('variants-invalid', `${path}.variants`, 'variant array required')
    }
    ;(Array.isArray(raw.variants) ? raw.variants : []).forEach((variant, variantIndex) => {
      const variantPath = `${path}.variants[${variantIndex}]`
      if (!record(variant)) {
        error('variant-invalid', variantPath, 'object required')
        return
      }
      const id = text(variant.id)
      const label = text(variant.label)
      if (!id || !ID.test(id))
        error('variant-id-invalid', `${variantPath}.id`, 'stable variant id required')
      if (!label) error('variant-label-invalid', `${variantPath}.label`, 'variant label required')
      let variantDims: { w: number; d: number; h: number } | undefined
      if (variant.dimensions !== undefined) {
        const value = record(variant.dimensions) ? variant.dimensions : {}
        const variantScale = unitScale(value.unit)
        if (!variantScale)
          error('unit-unsupported', `${variantPath}.dimensions.unit`, 'mm, cm or m required')
        const values = [value.width, value.depth, value.height]
        if (!values.every(finitePositive)) {
          error(
            'dimension-invalid',
            `${variantPath}.dimensions`,
            'three positive dimensions required'
          )
        } else {
          variantDims = {
            w: Math.round((value.width as number) * (variantScale ?? 1)),
            d: Math.round((value.depth as number) * (variantScale ?? 1)),
            h: Math.round((value.height as number) * (variantScale ?? 1)),
          }
        }
      }
      const variantPrice =
        record(variant.price) && finitePositive(variant.price.amount)
          ? Math.round(variant.price.amount)
          : undefined
      if (id && label) {
        protocolVariants.push({
          id,
          label,
          sku: text(variant.sku) ?? undefined,
          dims: variantDims,
          price: variantPrice,
          color: text(variant.color) ?? undefined,
        })
        if (variantDims) dimensionVariants.push({ id, label, dims: variantDims })
      }
    })

    let price: Product['retail']
    if (raw.price !== undefined) {
      const value = record(raw.price) ? raw.price : {}
      const amount = value.amount
      const basis = text(value.basis)
      const checkedAt = text(value.checkedAt)
      if (!finitePositive(amount) || !Number.isInteger(amount))
        error('price-invalid', `${path}.price.amount`, 'positive integer price required')
      if (value.currency !== 'KRW')
        error('currency-unsupported', `${path}.price.currency`, 'KRW required in v1')
      if (!basis) error('price-basis-invalid', `${path}.price.basis`, 'price basis required')
      if (!checkedAt || !DATE.test(checkedAt))
        error('price-date-invalid', `${path}.price.checkedAt`, 'YYYY-MM-DD required')
      if (finitePositive(amount) && basis && checkedAt && sourceUrl) {
        price = {
          retailer: provider ?? brand ?? 'unknown',
          articleNumber: text(raw.sku) ?? externalId ?? 'unknown',
          productUrl: sourceUrl,
          currency: 'KRW',
          amount,
          checkedAt,
          priceBasis: basis,
          included: stringList(value.included, `${path}.price.included`, issues),
          excluded: stringList(value.excluded, `${path}.price.excluded`, issues),
        }
      }
    }

    if (
      externalId &&
      name &&
      brand &&
      category &&
      sourceUrl &&
      retrievedAt &&
      dims.w &&
      dims.d &&
      dims.h
    ) {
      products.push({
        id: `catalog:${catalogId}:${externalId}`,
        name,
        brand,
        category,
        dims,
        mount,
        snapToWall,
        defaultElevation,
        shape,
        colorways: colorways.length ? colorways : undefined,
        dimensionVariants: dimensionVariants.length ? dimensionVariants : undefined,
        model: text(raw.sku) ?? undefined,
        sourceUrl,
        price: price?.amount,
        priceNote: price ? `${price.priceBasis} · ${price.checkedAt} 확인` : undefined,
        retail: price,
        catalog: {
          protocolVersion: '1.0',
          catalogId: catalogId ?? 'invalid',
          externalId,
          provider: provider ?? 'invalid',
          sourceUrl,
          retrievedAt,
          sku: text(raw.sku) ?? undefined,
          taxonomy: taxonomy ?? 'invalid',
          tags,
          materials,
          sourceImageUrls,
          variants: protocolVariants,
        },
        installation: {
          provides,
          requires:
            requiresRaw && (allOf.length || anyOf.length)
              ? {
                  allOf: allOf.length ? allOf : undefined,
                  anyOf: anyOf.length ? anyOf : undefined,
                  scope,
                }
              : undefined,
          surface:
            surfaceRaw && supportedBy.length
              ? { supportedBy, anchor: surfaceRaw.anchor === 'center' ? 'center' : 'rear' }
              : undefined,
        },
      })
    }
  })

  const errors = issues.filter((issue) => issue.severity === 'error')
  if (errors.length) throw new InvalidCatalogProtocolError(issues)
  return { catalogId: catalogId!, provider: provider!, products, issues }
}
