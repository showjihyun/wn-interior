import { describe, expect, it } from 'vitest'
import type { FloorPlan, Placement, Product } from '../domain/model'
import { createGenerateQuote } from './generateQuote'
import type { MaterialCatalog, MaterialReference, ProductCatalog } from './ports'

const products: Product[] = [
  {
    id: 'sofa',
    name: '소파',
    category: 'living',
    dims: { w: 2000, d: 900, h: 800 },
    mount: 'floor',
    shape: 'sofa3',
    price: 300_000,
  },
]

const productCatalog: ProductCatalog = {
  list: () => products,
  findById: (id) => products.find((product) => product.id === id),
}

const materials: MaterialReference[] = [
  { id: 'floor', kind: 'floor', name: '테스트 바닥재' },
  { id: 'wall', kind: 'wall', name: '테스트 벽재' },
]

const materialCatalog: MaterialCatalog = {
  list: () => materials,
  findById: (id) => materials.find((material) => material.id === id),
}

const plan: FloorPlan = {
  unit: 'mm',
  wallHeight: 2400,
  walls: [],
  openings: [],
  rooms: [
    {
      id: 'room',
      name: '거실',
      polygon: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      floorMaterialId: 'floor',
      wallMaterialId: 'wall',
    },
  ],
}

const placements: Placement[] = [
  { id: 'placement', productId: 'sofa', pos: { x: 0, y: 0, z: 0 }, rotY: 0 },
]

describe('GenerateQuote', () => {
  it('주입된 시계와 카탈로그로 견적 문서를 생성한다', () => {
    const useCase = createGenerateQuote({
      clock: { now: () => '2026-08-28T10:15:00.000Z' },
      products: productCatalog,
      materials: materialCatalog,
    })

    const text = useCase.execute({ projectName: '우리집', plan, placements })

    expect(text).toContain('2026-08-28T10:15:00.000Z')
    expect(text).toContain('테스트 바닥재')
    expect(text).toContain('테스트 벽재')
    expect(text).toContain('300,000원')
  })
})
