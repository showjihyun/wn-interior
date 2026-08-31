// 계약 테스트 — 브랜드 DB 로더와 입력 검증 규칙
import { describe, it, expect } from 'vitest'
import { loadBrandProducts, validateBrandProduct, getBrandList } from './brandCatalog'

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

  it('dimension variant id 중복·빈 label·음수 치수를 거절한다', () => {
    const baseVariant = { id: 'normal', label: '기본', dims: { w: 10, d: 10, h: 10 } }
    expect(
      validateBrandProduct({
        ...valid,
        dimensionVariants: [baseVariant, { ...baseVariant }],
      }).ok
    ).toBe(false)
    expect(
      validateBrandProduct({
        ...valid,
        dimensionVariants: [{ ...baseVariant, label: '' }],
      }).ok
    ).toBe(false)
    expect(
      validateBrandProduct({
        ...valid,
        dimensionVariants: [{ ...baseVariant, dims: { ...baseVariant.dims, w: -1 } }],
      }).ok
    ).toBe(false)
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
    expect(all.find((p) => p.id === 'ss-bespoke-fridge-875')!.dims).toEqual({
      w: 912,
      d: 930,
      h: 1853,
    })
    expect(all.find((p) => p.id === 'ik-kivik-3seat')!.dims).toEqual({ w: 2280, d: 950, h: 830 })
    expect(all.find((p) => p.id === 'sm-queen-set')!.dims).toEqual({ w: 1600, d: 2110, h: 1000 })
  })

  it('BILLY는 현재 판매 SKU·가격과 열린 5단 선반 형상을 사용한다', () => {
    const billy = loadBrandProducts().find((product) => product.id === 'ik-billy-bookcase')!

    expect(billy.model).toBe('BILLY 005.220.47')
    expect(billy.sourceUrl).toContain('/billy-bookcase-white-00522047/')
    expect(billy.shape).toBe('openBookcase')
    expect(billy.retail).toMatchObject({
      articleNumber: '005.220.47',
      amount: 89900,
      checkedAt: '2026-08-31',
      priceBasis: '책장 본체 1개',
    })
    expect(billy.appearance).toMatchObject({
      textureUrl: '/catalog/ikea/billy-bookcase-white.jpg',
      projection: 'cutout',
    })
  })

  it('KIVIK은 공식 좌석 실측과 DIMMA 비율 근거를 반영한 전용 소파 형상을 사용한다', () => {
    const kivik = loadBrandProducts().find((product) => product.id === 'ik-kivik-3seat')!

    expect(kivik.model).toBe('KIVIK 694.848.73')
    expect(kivik.dims).toEqual({ w: 2280, d: 950, h: 830 })
    expect(kivik.shape).toBe('kivikSofa')
    expect(kivik.note).toContain('좌석폭 180cm')
    expect(kivik.note).toContain('좌석깊이 60cm')
    expect(kivik.note).toContain('좌석높이 45cm')
  })

  it('FADO는 현재 판매 중인 화이트 25cm 단품 SKU·가격·치수를 사용한다', () => {
    const fado = loadBrandProducts().find((product) => product.id === 'ik-fado-lamp')!

    expect(fado.model).toBe('FADO 302.838.99')
    expect(fado.sourceUrl).toContain('/fado-table-lamp-white-30283899/')
    expect(fado.shape).toBe('tableGlobeLamp')
    expect(fado.dims).toEqual({ w: 250, d: 250, h: 240 })
    expect(fado.retail).toMatchObject({
      articleNumber: '302.838.99',
      amount: 24900,
      checkedAt: '2026-08-31',
      priceBasis: 'FADO 화이트 25cm 탁상스탠드 본체 1개',
    })
    expect(fado.retail?.included).toEqual(expect.arrayContaining(['FADO 탁상스탠드 본체']))
    expect(fado.retail?.excluded).toEqual(expect.arrayContaining(['E26 전구']))
    expect(fado.appearance).toMatchObject({
      textureUrl: '/catalog/ikea/fado-table-lamp-white.jpg',
      projection: 'cutout',
    })
  })

  it('MALM은 현재 갈빗살 미포함 조합의 SKU·가격·실측과 구성 범위를 사용한다', () => {
    const malm = loadBrandProducts().find((product) => product.id === 'ik-malm-queen')!

    expect(malm.model).toBe('MALM 890.052.64')
    expect(malm.sourceUrl).toContain('/malm-bed-frame-high-white-s89005264/')
    expect(malm.shape).toBe('highBedFrame')
    expect(malm.dims).toEqual({ w: 1660, d: 2090, h: 1000 })
    expect(malm.retail).toMatchObject({
      articleNumber: '890.052.64',
      amount: 304000,
      checkedAt: '2026-08-31',
      priceBasis: 'MALM 높은침대프레임+SKORVA 미드빔 조합 1세트',
    })
    expect(malm.retail?.included).toEqual(
      expect.arrayContaining(['MALM 높은침대프레임', 'SKORVA 미드빔'])
    )
    expect(malm.retail?.excluded).toEqual(
      expect.arrayContaining(['침대갈빗살', '매트리스', '침구'])
    )
    expect(malm.appearance).toMatchObject({
      textureUrl: '/catalog/ikea/malm-bed-frame-high-white.jpg',
      projection: 'cutout',
    })
  })

  it('LACK은 현재 블랙브라운 단품 SKU·가격과 하부선반 형상을 사용한다', () => {
    const lack = loadBrandProducts().find((product) => product.id === 'ik-lack-coffee')!

    expect(lack.model).toBe('LACK 803.529.51')
    expect(lack.sourceUrl).toContain('/lack-coffee-table-black-brown-80352951/')
    expect(lack.shape).toBe('shelfCoffeeTable')
    expect(lack.dims).toEqual({ w: 1180, d: 780, h: 450 })
    expect(lack.retail).toMatchObject({
      articleNumber: '803.529.51',
      amount: 59900,
      checkedAt: '2026-08-31',
      priceBasis: 'LACK 블랙브라운 118×78cm 커피테이블 본체 1개',
    })
    expect(lack.retail?.included).toEqual(
      expect.arrayContaining(['LACK 커피테이블 본체', '하부 선반'])
    )
    expect(lack.appearance).toMatchObject({
      textureUrl: '/catalog/ikea/lack-coffee-table-black-brown.jpg',
      projection: 'cutout',
    })
  })

  it('NORDEN은 현재 자작나무 SKU·가격과 890mm 기본 게이트레그 형상을 사용한다', () => {
    const norden = loadBrandProducts().find((product) => product.id === 'ik-norden-table')!

    expect(norden.model).toBe('NORDEN 804.238.83')
    expect(norden.sourceUrl).toContain('/norden-gateleg-table-birch-80423883/')
    expect(norden.shape).toBe('gatelegTable')
    expect(norden.dims).toEqual({ w: 890, d: 800, h: 740 })
    expect(norden.retail).toMatchObject({
      articleNumber: '804.238.83',
      amount: 399000,
      checkedAt: '2026-08-31',
      priceBasis: '게이트레그 테이블 본체 1개',
    })
    expect(norden.appearance).toMatchObject({
      textureUrl: '/catalog/ikea/norden-gateleg-table-birch.jpg',
      projection: 'cutout',
    })
    expect(norden.dimensionVariants).toEqual([
      { id: 'collapsed', label: '접힘 26cm', dims: { w: 260, d: 800, h: 740 } },
      { id: 'normal', label: '기본 89cm', dims: { w: 890, d: 800, h: 740 } },
      { id: 'expanded', label: '완전확장 152cm', dims: { w: 1520, d: 800, h: 740 } },
    ])
  })

  it('PAX는 실제 FORSAND 2프레임·4도어 조합 SKU와 구성 가격을 사용한다', () => {
    const pax = loadBrandProducts().find((product) => product.id === 'ik-pax-wardrobe-200')!

    expect(pax.model).toBe('PAX/FORSAND 495.010.34')
    expect(pax.sourceUrl).toContain('/pax-forsand-wardrobe-white-white-s49501034/')
    expect(pax.shape).toBe('modularWardrobe')
    expect(pax.dims).toEqual({ w: 2000, d: 600, h: 2012 })
    expect(pax.snapToWall).toBe(true)
    expect(pax.retail).toMatchObject({
      articleNumber: '495.010.34',
      amount: 670000,
      priceBasis: 'PAX/FORSAND 200cm 옷장 조합 1세트',
    })
    expect(pax.retail?.included).toEqual(
      expect.arrayContaining(['PAX 100cm 프레임 2개', 'FORSAND 50cm 도어 4개', '완충경첩 4세트'])
    )
    expect(pax.retail?.excluded).toEqual(expect.arrayContaining(['내부수납용품', '손잡이']))
    expect(pax.appearance).toMatchObject({
      textureUrl: '/catalog/ikea/pax-forsand-wardrobe-white-white.jpg',
      projection: 'cutout',
    })
  })

  it('IKEA 주방·바닥마감·붙박이 증분 상품은 공식 치수·가격·용도를 분리한다', () => {
    const all = loadBrandProducts()
    const kitchen = all.find((product) => product.id === 'ik-knoxhult-kitchen-204')!
    const flooring = all.find((product) => product.id === 'ik-runnen-floor-decking-beige')!
    const builtIn = all.find((product) => product.id === 'ik-pax-hasvik-wardrobe-150')!

    expect(kitchen).toMatchObject({
      category: 'kitchen',
      dims: { w: 2040, d: 610, h: 2200 },
      retail: { articleNumber: '295.594.55', amount: 575000 },
    })
    expect(kitchen.installation?.provides).toEqual(
      expect.arrayContaining(['kitchen.base-cabinet', 'kitchen.sink', 'kitchen.faucet'])
    )
    expect(flooring).toMatchObject({
      category: 'flooring',
      dims: { w: 300, d: 300, h: 20 },
      retail: { articleNumber: '604.767.35', amount: 22900 },
    })
    expect(flooring.name).toContain('야외용')
    expect(builtIn).toMatchObject({
      category: 'built-in',
      dims: { w: 1500, d: 660, h: 2012 },
      retail: { articleNumber: '194.297.56', amount: 537500 },
    })
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
