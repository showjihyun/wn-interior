import { describe, expect, it } from 'vitest'
import type { Product } from '../domain/model'
import { resolveDims } from '../domain/engine/dims'
import {
  findActiveDimensionVariant,
  placementPatchForDimensionVariant,
} from './productDimensionVariants'

const product: Product = {
  id: 'norden',
  name: 'NORDEN',
  category: 'living',
  dims: { w: 890, d: 800, h: 740 },
  mount: 'floor',
  shape: 'gatelegTable',
  dimensionVariants: [
    { id: 'collapsed', label: '접힘 26cm', dims: { w: 260, d: 800, h: 740 } },
    { id: 'normal', label: '기본 89cm', dims: { w: 890, d: 800, h: 740 } },
    { id: 'expanded', label: '완전확장 152cm', dims: { w: 1520, d: 800, h: 740 } },
  ],
}

describe('상품 공식 치수 variant 선택', () => {
  it('현재 유효 치수와 정확히 일치하는 상태를 찾는다', () => {
    expect(findActiveDimensionVariant(product, { w: 260, d: 800, h: 740 })?.id).toBe('collapsed')
    expect(findActiveDimensionVariant(product, product.dims)?.id).toBe('normal')
    expect(findActiveDimensionVariant(product, { w: 900, d: 800, h: 740 })).toBeUndefined()
  })

  it('기본 상태는 override를 제거하고 접힘·확장은 공식 치수 복사본을 반환한다', () => {
    expect(placementPatchForDimensionVariant(product, 'normal')).toEqual({
      dimsOverride: undefined,
    })
    expect(placementPatchForDimensionVariant(product, 'expanded')).toEqual({
      dimsOverride: { w: 1520, d: 800, h: 740 },
    })
    expect(placementPatchForDimensionVariant(product, 'missing')).toBeNull()
    const expanded = placementPatchForDimensionVariant(product, 'expanded')!
    expect(
      resolveDims(product, {
        id: 'placement',
        productId: product.id,
        pos: { x: 0, y: 0, z: 0 },
        rotY: 0,
        ...expanded,
      })
    ).toEqual({ w: 1520, d: 800, h: 740 })
  })
})
