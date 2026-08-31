import { describe, expect, it } from 'vitest'
import type { PlacementMoveHistoryState } from './placementMoveHistory'
import {
  executeProjectEdit,
  redoProjectEdit,
  undoProjectEdit,
  type ProjectEdit,
} from './projectEditing'

const initial = (): PlacementMoveHistoryState => ({
  plan: {
    unit: 'mm',
    wallHeight: 2400,
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 2000, y: 0 }, thickness: 120 }],
    openings: [],
    rooms: [
      {
        id: 'r1',
        name: '방',
        polygon: [
          { x: 0, y: 0 },
          { x: 2000, y: 0 },
          { x: 2000, y: 2000 },
        ],
      },
    ],
  },
  placements: [],
  customProducts: [],
  past: [],
  future: [],
})

describe('project editing commands', () => {
  it('배치 명령을 실행하고 undo/redo 한다', () => {
    const added = executeProjectEdit(initial(), {
      type: 'add-placement',
      placement: {
        id: 'pl1',
        productId: 'chair',
        pos: { x: 100, y: 0, z: 100 },
        rotY: 0,
      },
    })
    const updated = executeProjectEdit(added, {
      type: 'update-placement',
      id: 'pl1',
      patch: { rotY: 45 },
    })
    const undone = undoProjectEdit(updated)!
    const redone = redoProjectEdit(undone)!

    expect(undone.placements[0].rotY).toBe(0)
    expect(redone.placements[0].rotY).toBe(45)
  })

  it('방·벽·개구부 편집 불변식을 한 경로에서 적용한다', () => {
    const edits: ProjectEdit[] = [
      { type: 'rename-room', roomId: 'r1', name: '거실' },
      {
        type: 'set-room-material',
        roomId: 'r1',
        kind: 'floorMaterialId',
        materialId: 'floor',
      },
      {
        type: 'add-opening',
        opening: {
          id: 'o1',
          wallId: 'w1',
          type: 'door',
          offset: 200,
          width: 800,
          height: 2050,
          sill: 0,
        },
      },
      { type: 'update-opening', openingId: 'o1', patch: { width: 900 } },
      { type: 'set-wall-height', height: 2600 },
      { type: 'remove-wall', wallId: 'w1' },
    ]
    const result = edits.reduce(executeProjectEdit, initial())

    expect(result.plan.rooms[0]).toMatchObject({ name: '거실', floorMaterialId: 'floor' })
    expect(result.plan.wallHeight).toBe(2600)
    expect(result.plan.walls).toHaveLength(0)
    expect(result.plan.openings).toHaveLength(0)
  })

  it('복제·교체·삭제와 커스텀 제품 명령을 처리한다', () => {
    let state = executeProjectEdit(initial(), {
      type: 'add-placement',
      placement: {
        id: 'pl1',
        productId: 'chair',
        pos: { x: 100, y: 0, z: 100 },
        rotY: 0,
      },
    })
    state = executeProjectEdit(state, {
      type: 'duplicate-placement',
      sourceId: 'pl1',
      placementId: 'pl2',
    })
    state = executeProjectEdit(state, { type: 'remove-placement', id: 'pl1' })
    state = executeProjectEdit(state, {
      type: 'add-custom-product',
      product: {
        id: 'custom',
        name: '제품',
        category: 'custom',
        dims: { w: 1, d: 1, h: 1 },
        mount: 'floor',
        shape: 'box',
      },
    })
    state = executeProjectEdit(state, { type: 'replace-placements', placements: [] })

    expect(state.placements).toEqual([])
    expect(state.customProducts.map((product) => product.id)).toContain('custom')
  })

  it('프로토콜 상품을 ID별로 원자적 upsert하고 metadata를 복사한다', () => {
    const product = {
      id: 'catalog:test:item',
      name: '가져온 제품',
      brand: '테스트',
      category: 'kitchen' as const,
      dims: { w: 600, d: 600, h: 800 },
      mount: 'floor' as const,
      shape: 'box' as const,
      catalog: {
        protocolVersion: '1.0' as const,
        catalogId: 'test',
        externalId: 'item',
        provider: 'Test',
        sourceUrl: 'https://example.com/item',
        retrievedAt: '2026-08-31T00:00:00.000Z',
        taxonomy: 'kitchen.base-cabinet',
        tags: [],
        materials: ['목재'],
        sourceImageUrls: [],
        variants: [],
      },
      installation: { provides: ['kitchen.base-cabinet'] },
    }
    const first = executeProjectEdit(initial(), { type: 'import-products', products: [product] })
    const second = executeProjectEdit(first, {
      type: 'import-products',
      products: [{ ...product, name: '갱신된 제품' }],
    })

    expect(second.customProducts).toHaveLength(1)
    expect(second.customProducts[0]).toMatchObject({
      name: '갱신된 제품',
      catalog: { materials: ['목재'] },
      installation: { provides: ['kitchen.base-cabinet'] },
    })
    expect(second.customProducts[0].catalog?.materials).not.toBe(product.catalog.materials)
  })
})
