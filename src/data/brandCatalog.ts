// ─────────────────────────────────────────────────────────────
// 브랜드 제품 DB 로더 — src/data/brands/*.json (웹 리서치 기반 실측)
// 규칙: 모든 항목은 validateBrandProduct를 통과해야 카탈로그에 합류
// ─────────────────────────────────────────────────────────────
import type { CategoryId, Product, ShapeKind } from '../types'
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
  'box', 'sofa3', 'armchair', 'coffeeTable', 'diningTable', 'chair', 'bed', 'wardrobe',
  'dresser', 'sideTable', 'tvStand', 'tvWall', 'sinkLower', 'sinkUpper', 'fridge', 'rug',
  'shoeCabinet', 'desk', 'shelfWall', 'washer', 'ac', 'pendant', 'floorLamp', 'toilet',
  'washbasin', 'mirror', 'microwave', 'islandBar', 'robotVacuum', 'airPurifier', 'tvOled',
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

  const category: CategoryId = CATEGORIES.includes(raw.category as CategoryId)
    ? (raw.category as CategoryId)
    : 'custom'
  const mount = raw.mount === 'wall-mount' || raw.mount === 'ceiling' || raw.mount === 'wall' ? raw.mount : 'floor'

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
    price: typeof raw.price === 'number' && raw.price > 0 ? raw.price : undefined,
    priceNote: raw.priceNote,
    note: raw.note,
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
  return [...new Set(loadBrandProducts().map((p) => p.brand).filter(Boolean) as string[])].sort()
}
