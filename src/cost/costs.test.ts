// TDD RED — 가격 합산 리포트 (아직 구현 없음)
import { describe, it, expect } from 'vitest'
import { buildCostReport } from './costs'
import type { Placement, Product } from '../types'

const sofa: Product = { id: 'p-sofa3', name: '3인 소파', category: 'living', dims: { w: 1, d: 1, h: 1 }, mount: 'floor', shape: 'sofa3', price: 500000, sourceUrl: 'https://x/1' }
const rug: Product = { id: 'p-rug', name: '러그', category: 'living', dims: { w: 1, d: 1, h: 1 }, mount: 'floor', shape: 'rug' } // 가격 미확인
const tv: Product = { id: 'lg-tv', name: 'OLED TV', brand: 'LG전자', category: 'appliance', dims: { w: 1, d: 1, h: 1 }, mount: 'floor', shape: 'tvOled', price: 1500000, sourceUrl: 'https://x/2' }

const P = (id: string, productId: string): Placement => ({ id, productId, pos: { x: 0, y: 0, z: 0 }, rotY: 0 })
const productOf = (pid: string) => ({ 'p-sofa3': sofa, 'p-rug': rug, 'lg-tv': tv } as Record<string, Product>)[pid]

describe('buildCostReport (배치 제품 가격 합산)', () => {
  it('동일 제품은 수량 집계, 소계 = 단가×수량', () => {
    const r = buildCostReport([P('a', 'p-sofa3'), P('b', 'p-sofa3'), P('c', 'lg-tv')], productOf)
    const sofaLine = r.lines.find((l) => l.productId === 'p-sofa3')!
    expect(sofaLine.qty).toBe(2)
    expect(sofaLine.subtotal).toBe(1_000_000)
    expect(r.pricedTotal).toBe(2_500_000)
  })

  it('가격 미확인 제품은 unpriced로 분리되고 합계에서 제외된다', () => {
    const r = buildCostReport([P('a', 'p-rug')], productOf)
    expect(r.pricedTotal).toBe(0)
    expect(r.unpriced).toHaveLength(1)
    expect(r.unpriced[0].name).toBe('러그')
    expect(r.unpriced[0].qty).toBe(1)
  })

  it('라인에는 브랜드와 출처 링크가 보존된다', () => {
    const r = buildCostReport([P('c', 'lg-tv')], productOf)
    expect(r.lines[0].brand).toBe('LG전자')
    expect(r.lines[0].sourceUrl).toBe('https://x/2')
  })

  it('빈 배치는 0원, 줄 없음', () => {
    const r = buildCostReport([], productOf)
    expect(r.lines).toHaveLength(0)
    expect(r.pricedTotal).toBe(0)
  })
})
