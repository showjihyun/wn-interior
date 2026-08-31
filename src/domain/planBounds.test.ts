import { describe, expect, it } from 'vitest'
import type { FloorPlan } from './model'
import { getPlanBounds, getPlanCenter } from './planBounds'

const empty: FloorPlan = {
  unit: 'mm',
  wallHeight: 2400,
  walls: [],
  openings: [],
  rooms: [],
}

describe('plan bounds', () => {
  it('빈 도면은 NaN 대신 명시적 null과 원점 중심을 반환한다', () => {
    expect(getPlanBounds(empty)).toBeNull()
    expect(getPlanCenter(empty)).toEqual({ x: 0, y: 0 })
  })

  it('벽과 방의 모든 좌표를 포함하는 경계를 계산한다', () => {
    const plan: FloorPlan = {
      ...empty,
      walls: [{ id: 'w1', a: { x: -100, y: 50 }, b: { x: 900, y: 50 }, thickness: 120 }],
      rooms: [
        {
          id: 'r1',
          name: '방',
          polygon: [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 800 },
          ],
        },
      ],
    }
    expect(getPlanBounds(plan)).toMatchObject({
      minX: -100,
      maxX: 1000,
      minY: 0,
      maxY: 800,
      width: 1100,
      depth: 800,
      center: { x: 450, y: 400 },
    })
  })
})
