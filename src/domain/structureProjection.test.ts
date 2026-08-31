import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening } from './model'
import { buildWallSlices, resolveWallMaterialId } from './structureProjection'

describe('structure projection', () => {
  it('문 개구부를 제외한 좌우·상단 벽 슬라이스를 만든다', () => {
    const door: Opening = {
      id: 'o1',
      wallId: 'w1',
      type: 'door',
      offset: 1000,
      width: 800,
      height: 2000,
      sill: 0,
    }
    expect(buildWallSlices(3000, 2400, [door])).toEqual([
      { len: 1000, hgt: 2400, yBase: 0, start: 0 },
      { len: 800, hgt: 400, yBase: 2000, start: 1000 },
      { len: 1200, hgt: 2400, yBase: 0, start: 1800 },
    ])
  })

  it('벽 인접 방의 마감재를 선택한다', () => {
    const plan: FloorPlan = {
      unit: 'mm',
      wallHeight: 2400,
      walls: [],
      openings: [],
      rooms: [
        {
          id: 'r1',
          name: '방',
          wallMaterialId: 'wallpaper',
          polygon: [
            { x: 0, y: 0 },
            { x: 2000, y: 0 },
            { x: 2000, y: 2000 },
            { x: 0, y: 2000 },
          ],
        },
      ],
    }
    expect(resolveWallMaterialId(plan, 1000, 0, 0)).toBe('wallpaper')
  })
})
