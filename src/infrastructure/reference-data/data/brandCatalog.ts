// ─────────────────────────────────────────────────────────────
// 브랜드 제품 DB 로더 — src/data/brands/*.json (웹 리서치 기반 실측)
// 규칙: 모든 항목은 validateBrandProduct를 통과해야 카탈로그에 합류
// ─────────────────────────────────────────────────────────────
import type { CategoryId, Product, ShapeKind } from '../../../domain/model'
import hanssemJson from './brands/hanssem.json'
import lgJson from './brands/lg.json'
import samsungJson from './brands/samsung.json'
import ikeaJson from './brands/ikea.json'
import simmonsJson from './brands/simmons.json'

interface RawBrandProduct {
  id?: string
  name?: string
  model?: string
  category?: string
  dims?: { w?: number; d?: number; h?: number }
  mount?: string
  snapToWall?: boolean
  defaultElevation?: number
  shape?: string
  colorways?: string[]
  note?: string
  sourceUrl?: string
  price?: number
  priceNote?: string
  retail?: {
    retailer?: string
    articleNumber?: string
    productUrl?: string
    currency?: string
    amount?: number
    checkedAt?: string
    priceBasis?: string
    included?: string[]
    excluded?: string[]
    description?: string
  }
  appearance?: {
    textureUrl?: string
    imageSourceUrl?: string
    sha256?: string
    projection?: string
    removeWhiteBackground?: boolean
    alphaThreshold?: number
  }
  dimensionVariants?: Array<{
    id?: string
    label?: string
    dims?: { w?: number; d?: number; h?: number }
  }>
}

interface RawBrandFile {
  brand?: string
  fetchedAt?: string
  products?: RawBrandProduct[]
}

const FILES: RawBrandFile[] = [
  hanssemJson as RawBrandFile,
  lgJson as RawBrandFile,
  samsungJson as RawBrandFile,
  ikeaJson as RawBrandFile,
  simmonsJson as RawBrandFile,
]

const CATEGORIES: CategoryId[] = [
  'kitchen',
  'living',
  'bedroom',
  'storage',
  'appliance',
  'lighting',
  'bath',
  'custom',
]

const SHAPES = new Set([
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

export interface ValidateResult {
  ok: boolean
  error?: string
  product?: Product
}

/** DB 항목 1건 검증 + Product 변환 (출처 필드 보존, wall-mount 기본 높이 보정) */
export function validateBrandProduct(raw: RawBrandProduct): ValidateResult {
  const id = (raw.id ?? '').trim()
  const name = (raw.name ?? '').trim()
  const w = raw.dims?.w ?? 0
  const d = raw.dims?.d ?? 0
  const h = raw.dims?.h ?? 0
  const shape = raw.shape as ShapeKind | undefined

  if (!id) return { ok: false, error: 'id 누락' }
  if (!name) return { ok: false, error: `name 누락 (${id})` }
  if (!(w > 0) || !(d > 0) || !(h > 0)) return { ok: false, error: `dims 무효 (${id})` }
  if (!shape || !SHAPES.has(shape)) return { ok: false, error: `shape 무효 (${id}: ${raw.shape})` }
  if (raw.retail) {
    if (
      !raw.retail.retailer ||
      !raw.retail.articleNumber ||
      !raw.retail.productUrl?.startsWith('https://') ||
      raw.retail.currency !== 'KRW' ||
      !(Number(raw.retail.amount) > 0) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.retail.checkedAt ?? '') ||
      !raw.retail.priceBasis
    ) {
      return { ok: false, error: `retail 무효 (${id})` }
    }
  }
  if (raw.appearance) {
    if (
      !raw.appearance.textureUrl?.startsWith('/catalog/') ||
      !raw.appearance.imageSourceUrl?.startsWith('https://www.ikea.com/') ||
      !/^[a-f0-9]{64}$/.test(raw.appearance.sha256 ?? '') ||
      !['front', 'top', 'curtain', 'cutout'].includes(raw.appearance.projection ?? '')
    ) {
      return { ok: false, error: `appearance 무효 (${id})` }
    }
  }
  if (raw.dimensionVariants) {
    const ids = new Set<string>()
    if (
      raw.dimensionVariants.length === 0 ||
      raw.dimensionVariants.some((variant) => {
        const variantId = (variant.id ?? '').trim()
        const valid =
          !!variantId &&
          !!variant.label?.trim() &&
          (variant.dims?.w ?? 0) > 0 &&
          (variant.dims?.d ?? 0) > 0 &&
          (variant.dims?.h ?? 0) > 0 &&
          !ids.has(variantId)
        ids.add(variantId)
        return !valid
      })
    ) {
      return { ok: false, error: `dimensionVariants 무효 (${id})` }
    }
  }

  const category: CategoryId = CATEGORIES.includes(raw.category as CategoryId)
    ? (raw.category as CategoryId)
    : 'custom'
  const mount =
    raw.mount === 'wall-mount' ||
    raw.mount === 'ceiling' ||
    raw.mount === 'wall' ||
    raw.mount === 'surface'
      ? raw.mount
      : 'floor'

  const product: Product = {
    id,
    name,
    brand: undefined,
    category,
    dims: { w, d, h },
    mount,
    snapToWall: raw.snapToWall,
    // wall-mount는 바닥 기준 설치 높이가 반드시 필요 (미지정 시 900mm)
    defaultElevation: mount === 'wall-mount' ? (raw.defaultElevation ?? 900) : raw.defaultElevation,
    colorways: raw.colorways,
    shape,
    model: raw.model,
    sourceUrl: raw.sourceUrl,
    price:
      typeof raw.price === 'number' && raw.price > 0
        ? raw.price
        : raw.retail?.amount && raw.retail.amount > 0
          ? raw.retail.amount
          : undefined,
    priceNote:
      raw.priceNote ??
      (raw.retail ? `${raw.retail.priceBasis} · ${raw.retail.checkedAt} 확인` : undefined),
    note: raw.note,
    retail: raw.retail
      ? {
          retailer: raw.retail.retailer!,
          articleNumber: raw.retail.articleNumber!,
          productUrl: raw.retail.productUrl!,
          currency: 'KRW',
          amount: raw.retail.amount!,
          checkedAt: raw.retail.checkedAt!,
          priceBasis: raw.retail.priceBasis!,
          included: raw.retail.included ?? [],
          excluded: raw.retail.excluded ?? [],
          description: raw.retail.description,
        }
      : undefined,
    appearance: raw.appearance
      ? {
          textureUrl: raw.appearance.textureUrl!,
          imageSourceUrl: raw.appearance.imageSourceUrl!,
          sha256: raw.appearance.sha256!,
          projection: raw.appearance.projection as NonNullable<Product['appearance']>['projection'],
          removeWhiteBackground: raw.appearance.removeWhiteBackground,
          alphaThreshold: raw.appearance.alphaThreshold,
        }
      : undefined,
    dimensionVariants: raw.dimensionVariants?.map((variant) => ({
      id: variant.id!.trim(),
      label: variant.label!.trim(),
      dims: { w: variant.dims!.w!, d: variant.dims!.d!, h: variant.dims!.h! },
    })),
  }
  return { ok: true, product }
}

/** 브랜드 JSON 파일 전체를 로드해 검증 통과 항목만 Product[]로 반환 */
export function loadBrandProducts(): Product[] {
  const out: Product[] = []
  for (const file of FILES) {
    const brand = (file.brand ?? '').trim()
    const fetchedAt = (file.fetchedAt ?? '').trim()
    for (const raw of file.products ?? []) {
      const r = validateBrandProduct(raw)
      if (!r.ok) {
        // DB 오류 항목은 조용히 건너뛰지 않고 콘솔로 알림 (개발 중 발견용)
        console.warn(`[brandCatalog] 제외됨: ${r.error}`)
        continue
      }
      out.push({
        ...r.product!,
        brand: brand || r.product!.brand,
        sourcedAt: fetchedAt || undefined,
      })
    }
  }
  return out
}

/** 브랜드 필터 칩용 — 실측 DB 브랜드만 유니크·정렬 추출 (일반 규격 제외) */
export function getBrandList(): string[] {
  return [
    ...new Set(
      loadBrandProducts()
        .map((p) => p.brand)
        .filter(Boolean) as string[]
    ),
  ].sort()
}
