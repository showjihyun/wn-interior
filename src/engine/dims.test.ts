// 계약 테스트 — 배치 단위 치수 오버라이드와 실측 폴백
import { describe, it, expect } from 'vitest'
import { resolveDims } from './dims'
import type { Placement, Product } from '../types'

const sofa: Product = {
  id: 'p-sofa3',
  name: '소파',
  category: 'living',
  dims: { w: 2100, d: 950, h: 850 },
  mount: 'floor',
  shape: 'sofa3',
}
const pl: Placement = { id: 'a', productId: 'p-sofa3', pos: { x: 0, y: 0, z: 0 }, rotY: 0 }

describe('resolveDims (치수 오버라이드 해석)', () => {
  it('오버라이드 없으면 제품 실측 그대로', () => {
    expect(resolveDims(sofa, pl)).toEqual({ w: 2100, d: 950, h: 850 })
    expect(resolveDims(sofa, { ...pl, dimsOverride: undefined })).toEqual({
      w: 2100,
      d: 950,
      h: 850,
    })
  })

  it('오버라이드 값이 있으면 우선한다', () => {
    expect(resolveDims(sofa, { ...pl, dimsOverride: { w: 1800, d: 900, h: 800 } })).toEqual({
      w: 1800,
      d: 900,
      h: 800,
    })
  })

  it('오버라이드 일부 누락/무효는 제품 값으로 폴백한다', () => {
    expect(resolveDims(sofa, { ...pl, dimsOverride: { w: 1800 } as any })).toEqual({
      w: 1800,
      d: 950,
      h: 850,
    })
    expect(resolveDims(sofa, { ...pl, dimsOverride: { w: -5, d: 900, h: 800 } })).toEqual({
      w: 2100,
      d: 900,
      h: 800,
    })
  })

  it('placement가 없어도 제품 실측 반환', () => {
    expect(resolveDims(sofa, undefined)).toEqual({ w: 2100, d: 950, h: 850 })
  })
})
