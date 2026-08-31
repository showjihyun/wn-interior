import { describe, expect, it } from 'vitest'
import type { Placement, Product } from './model'
import { resolveAuthoritativePlacementGeometry } from './authoritativePlacementGeometry'

const product: Product = {
  id: 'cabinet',
  name: '실측 수납장',
  category: 'storage',
  dims: { w: 800, d: 400, h: 1200 },
  mount: 'wall-mount',
  defaultElevation: 900,
  shape: 'wardrobe',
}

describe('실측 배치 형상', () => {
  it('사용자 치수와 설치 높이를 합쳐 모든 물리 판정의 단일 기준을 만든다', () => {
    const placement: Placement = {
      id: 'placed-cabinet',
      productId: product.id,
      pos: { x: 0, y: 0, z: 0 },
      rotY: 0,
      dimsOverride: { w: 920, d: 460, h: 1280 },
      elevationOverride: 1040,
    }

    expect(resolveAuthoritativePlacementGeometry(product, placement)).toEqual({
      dims: { w: 920, d: 460, h: 1280 },
      mount: 'wall-mount',
      elevation: 1040,
      blocksFloor: false,
    })
  })

  it('무효 치수는 공식 실측으로 복구하고 50mm 이하 바닥 제품은 통과형으로 분류한다', () => {
    const flatProduct: Product = {
      ...product,
      mount: 'floor',
      dims: { w: 1600, d: 1000, h: 20 },
    }
    const placement: Placement = {
      id: 'flat',
      productId: product.id,
      pos: { x: 0, y: 0, z: 0 },
      rotY: 0,
      dimsOverride: { w: 0, d: -1, h: Number.NaN },
    }

    expect(resolveAuthoritativePlacementGeometry(flatProduct, placement)).toEqual({
      dims: flatProduct.dims,
      mount: 'floor',
      elevation: 0,
      blocksFloor: false,
    })
  })
})
