// TDD RED — 브랜드 DB 로더/검증 (아직 구현 없음)
import { describe, it, expect } from 'vitest'
import { loadBrandProducts, validateBrandProduct, getBrandList } from './brandCatalog'

interface RawWithSource {
  id?: string
  name?: string
  model?: string
  sourceUrl?: string
  sourcedAt?: string
}

describe('validateBrandProduct (DB 항목 검증)', () => {
  const valid = {
    id: 'lg-x',
    name: 'LG 제품',
    brand: 'LG전자',
    category: 'appliance',
    dims: { w: 342, d: 342, h: 95 },
    mount: 'floor',
    shape: 'robotVacuum',
  }

  it('유효한 항목은 그대로 통과하며 출처·가격 필드를 보존한다', () => {
    const r = validateBrandProduct({
      ...valid,
      model: 'R580HK',
      sourceUrl: 'https://www.lge.co.kr/x',
      price: 900000,
      priceNote: '정상가 기준',
    })
    expect(r.ok).toBe(true)
    expect(r.product!.model).toBe('R580HK')
    expect(r.product!.sourceUrl).toBe('https://www.lge.co.kr/x')
    expect(r.product!.price).toBe(900000)
    expect(r.product!.priceNote).toBe('정상가 기준')
  })

  it('치수가 0/음수/누락이면 거절한다', () => {
    expect(validateBrandProduct({ ...valid, dims: { w: 0, d: 342, h: 95 } }).ok).toBe(false)
    expect(validateBrandProduct({ ...valid, dims: { w: -1, d: 342, h: 95 } }).ok).toBe(false)
    expect(validateBrandProduct({ ...valid, dims: { w: 10, d: 10 } as any }).ok).toBe(false)
  })

  it('id/name/shape 누락은 거절한다', () => {
    expect(validateBrandProduct({ ...valid, id: '' }).ok).toBe(false)
    expect(validateBrandProduct({ ...valid, name: '' }).ok).toBe(false)
    expect(validateBrandProduct({ ...valid, shape: 'nope' as any }).ok).toBe(false)
  })

  it('wall-mount 제품은 defaultElevation 기본값을 부여한다', () => {
    const r = validateBrandProduct({ ...valid, mount: 'wall-mount', shape: 'tvWall' })
    expect(r.ok).toBe(true)
    expect(r.product!.defaultElevation).toBeGreaterThan(0)
  })
})

describe('loadBrandProducts (JSON DB → Product[] 병합)', () => {
  it('한샘·LG DB를 모두 로드하고 브랜드/출처가 채워진다', () => {
    const all = loadBrandProducts()
    expect(all.length).toBeGreaterThanOrEqual(10)
    const lg = all.find((p) => p.id === 'lg-cordzero-r5')!
    expect(lg.brand).toBe('LG전자')
    expect(lg.dims).toEqual({ w: 342, d: 342, h: 95 })
    expect(lg.sourceUrl).toMatch(/^https:/)
    const hs = all.find((p) => p.id === 'hs-kitchenbach-lower')!
    expect(hs.brand).toBe('한샘')
    expect(hs.snapToWall).toBe(true)
  })

  it('M12: 5개 브랜드 파일(한샘·LG·삼성·IKEA·시몬스)이 모두 로드된다', () => {
    const all = loadBrandProducts()
    const brands = new Set(all.map((p) => p.brand))
    for (const b of ['한샘', 'LG전자', '삼성전자', 'IKEA', '시몬스']) {
      expect(brands.has(b)).toBe(true)
    }
    // 대표 제품 실측 스팟 체크
    expect(all.find((p) => p.id === 'ss-bespoke-fridge-875')!.dims).toEqual({ w: 912, d: 930, h: 1853 })
    expect(all.find((p) => p.id === 'ik-kivik-3seat')!.dims).toEqual({ w: 2280, d: 950, h: 830 })
    expect(all.find((p) => p.id === 'sm-queen-set')!.dims).toEqual({ w: 1600, d: 2110, h: 1000 })
  })

  it('getBrandList: 카탈로그에서 브랜드를 유니크 추출한다 (전체 제외)', () => {
    const brands = getBrandList()
    expect(brands).toContain('한샘')
    expect(brands).toContain('LG전자')
    expect(brands).toContain('삼성전자')
    expect(brands).toContain('IKEA')
    expect(brands).toContain('시몬스')
    expect(brands).not.toContain('전체')
    expect(brands).not.toContain('일반 규격') // 브랜드 필터 대상 아님
    // 정렬 + 중복 없음
    const set = new Set(brands)
    expect(set.size).toBe(brands.length)
    expect([...brands].sort()).toEqual(brands)
  })

  it('id 중복 없음, 모든 항목 dims 양수', () => {
    const all = loadBrandProducts()
    const ids = new Set(all.map((p) => p.id))
    expect(ids.size).toBe(all.length)
    for (const p of all) {
      expect(p.dims.w).toBeGreaterThan(0)
      expect(p.dims.d).toBeGreaterThan(0)
      expect(p.dims.h).toBeGreaterThan(0)
      expect(p.sourceUrl).toBeTruthy()
    }
  })
})
