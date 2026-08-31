import { describe, expect, it } from 'vitest'
import type { FloorPlan } from './model'
import { createOpeningOnNearestWall } from './openingPolicy'

const plan: FloorPlan = {
  unit: 'mm',
  wallHeight: 2400,
  walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 2000, y: 0 }, thickness: 120 }],
  openings: [],
  rooms: [],
}

describe('opening policy', () => {
  it('벽 끝에 배치해도 개구부 폭이 벽 범위를 넘지 않는다', () => {
    expect(createOpeningOnNearestWall(plan, { x: 1950, y: 10 }, 'door')).toMatchObject({
      wallId: 'w1',
      offset: 1200,
      width: 800,
    })
  })

  it('스냅 거리 밖이면 개구부를 만들지 않는다', () => {
    expect(createOpeningOnNearestWall(plan, { x: 1000, y: 1000 }, 'window')).toBeNull()
  })
})
