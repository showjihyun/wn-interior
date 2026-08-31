import { describe, expect, it } from 'vitest'
import type { Placement } from './model'
import { transformAttachmentTree } from './installationAttachments'

const placements: Placement[] = [
  {
    id: 'cabinet',
    productId: 'cabinet-product',
    roomId: 'kitchen',
    pos: { x: 1000, y: 0, z: 1000 },
    rotY: 0,
  },
  {
    id: 'sink',
    productId: 'sink-product',
    roomId: 'kitchen',
    pos: { x: 1100, y: 800, z: 1000 },
    rotY: 0,
    supportPlacementId: 'cabinet',
  },
  {
    id: 'tap',
    productId: 'tap-product',
    roomId: 'kitchen',
    pos: { x: 1100, y: 800, z: 900 },
    rotY: 15,
    supportPlacementId: 'sink',
  },
  {
    id: 'other',
    productId: 'other-product',
    pos: { x: 5000, y: 0, z: 5000 },
    rotY: 0,
  },
]

describe('installation attachment transforms', () => {
  it('부모 이동과 회전을 모든 하위 attachment에 같은 rigid transform으로 전파한다', () => {
    const result = transformAttachmentTree(placements, 'cabinet', {
      x: 3000,
      z: 4000,
      rotY: 90,
      roomId: 'new-kitchen',
    })

    expect(result.find((placement) => placement.id === 'cabinet')).toMatchObject({
      pos: { x: 3000, z: 4000 },
      rotY: 90,
      roomId: 'new-kitchen',
    })
    expect(result.find((placement) => placement.id === 'sink')).toMatchObject({
      pos: { x: 3000, y: 800, z: 4100 },
      rotY: 90,
      roomId: 'new-kitchen',
      supportPlacementId: 'cabinet',
    })
    expect(result.find((placement) => placement.id === 'tap')).toMatchObject({
      pos: { x: 3100, y: 800, z: 4100 },
      rotY: 105,
      roomId: 'new-kitchen',
      supportPlacementId: 'sink',
    })
    expect(result.find((placement) => placement.id === 'other')).toEqual(placements[3])
  })

  it('존재하지 않는 부모는 배치를 바꾸지 않는다', () => {
    expect(transformAttachmentTree(placements, 'missing', { x: 0, z: 0, rotY: 0 })).toBe(placements)
  })
})
