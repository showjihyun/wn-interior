import { describe, expect, it } from 'vitest'
import type { RawPlan } from '../domain/engine/planVision'
import { applyFloorPlanDraft } from './applyFloorPlanDraft'

const draft = (): RawPlan => ({
  wallHeight: 2400,
  walls: [{ a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 120 }],
  openings: [{ type: 'door', at: { x: 1500, y: 0 }, width: 900 }],
  rooms: [
    {
      name: '거실',
      polygon: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      areaM2: 12,
    },
  ],
  mmPerPx: 10,
})

describe('ApplyFloorPlanDraft', () => {
  it('검토를 통과한 초안을 유효한 FloorPlan과 개구부 offset으로 변환한다', () => {
    const plan = applyFloorPlanDraft({
      draft: draft(),
      detectedRegionCount: 1,
      scaleCanApply: true,
      blockerCount: 0,
    })

    expect(plan.unit).toBe('mm')
    expect(plan.walls).toHaveLength(1)
    expect(plan.openings[0]).toMatchObject({ wallId: 'w1', offset: 1500, width: 900 })
  })

  it('복수 도면이나 축척 blocker가 있으면 적용을 거부한다', () => {
    expect(() =>
      applyFloorPlanDraft({
        draft: draft(),
        detectedRegionCount: 2,
        scaleCanApply: false,
        blockerCount: 1,
      })
    ).toThrow('review-required')
  })
})
