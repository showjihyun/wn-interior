// 계약 테스트 — 견적서 텍스트 생성 규칙
import { describe, it, expect } from 'vitest'
import { buildQuoteText } from './quoteDocument'
import { buildCostReport } from '../domain/costs'
import type { FloorPlan, Placement, Product } from '../domain/model'

const sofa: Product = {
  id: 'p-sofa3',
  name: '3인 소파',
  brand: '일반규격',
  category: 'living',
  dims: { w: 1, d: 1, h: 1 },
  mount: 'floor',
  shape: 'sofa3',
  price: 500000,
}
const rug: Product = {
  id: 'p-rug',
  name: '러그',
  category: 'living',
  dims: { w: 1, d: 1, h: 1 },
  mount: 'floor',
  shape: 'rug',
}
const productOf = (pid: string) =>
  (({ 'p-sofa3': sofa, 'p-rug': rug }) as Record<string, Product>)[pid]
const P = (id: string, productId: string): Placement => ({
  id,
  productId,
  pos: { x: 0, y: 0, z: 0 },
  rotY: 0,
})

const plan: FloorPlan = {
  unit: 'mm',
  wallHeight: 2400,
  walls: [],
  openings: [],
  rooms: [
    {
      id: 'r1',
      name: '안방',
      polygon: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      floorMaterialId: 'f-wood-natural',
      wallMaterialId: 'w-silk-white',
    },
  ],
}

const quoteContext = {
  generatedAt: '2026-08-28T00:00:00.000Z',
  materialNameOf: (id?: string) =>
    id === 'f-wood-natural'
      ? '마루 내추럴 오크'
      : id === 'w-silk-white'
        ? '실크 벽지 화이트'
        : undefined,
}

describe('buildQuoteText (견적서 마크다운)', () => {
  it('주입된 작성 시각과 재료 조회만 사용한다', () => {
    const text = buildQuoteText('주입 견적', buildCostReport([], productOf), plan, {
      generatedAt: '2026-08-28T09:30:00+09:00',
      materialNameOf: (id) =>
        id === 'f-wood-natural' ? '주입 바닥재' : id === 'w-silk-white' ? '주입 벽재' : undefined,
    })

    expect(text).toContain('2026-08-28T09:30:00+09:00')
    expect(text).toContain('주입 바닥재')
    expect(text).toContain('주입 벽재')
  })

  it('프로젝트명/날짜/면적/제품 합계/미확인/마감재가 모두 포함된다', () => {
    const report = buildCostReport(
      [P('a', 'p-sofa3'), P('b', 'p-sofa3'), P('c', 'p-rug')],
      productOf
    )
    const text = buildQuoteText('우리집', report, plan, quoteContext)
    expect(text).toContain('우리집')
    expect(text).toContain('견적서')
    expect(text).toContain('3인 소파')
    expect(text).toContain('500,000원')
    expect(text).toContain('1,000,000원')
    expect(text).toContain('러그')
    expect(text).toContain('견적 필요')
    expect(text).toContain('안방')
    expect(text).toContain('12.0')
    expect(text).toContain('마루 내추럴 오크')
    expect(text).toContain('실크 벽지 화이트')
  })

  it('빈 배치·방 없이도 안전하게 생성', () => {
    const report = buildCostReport([], productOf)
    const text = buildQuoteText('빈집', report, { ...plan, rooms: [] }, quoteContext)
    expect(text).toContain('빈집')
    expect(text).toContain('0원')
  })
})
