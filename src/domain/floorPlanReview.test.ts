import { describe, expect, it } from 'vitest'
import { SAMPLE_PLAN } from '../infrastructure/reference-data/data/samplePlan'
import type { FloorPlanReview } from './model'
import {
  floorPlanFingerprint,
  floorPlanReviewBlocks3d,
  floorPlanReviewTargetLabel,
  floorPlanReviewTargetFingerprints,
  isFloorPlanReviewComplete,
  validateFloorPlanReviewEvidence,
} from './floorPlanReview'

const review = (baselinePlanFingerprint = floorPlanFingerprint(SAMPLE_PLAN)): FloorPlanReview => ({
  sourceImageDataUrl: 'data:image/jpeg;base64,review',
  sourceWidth: 800,
  sourceHeight: 560,
  mmPerPx: 20,
  scaleMode: 'calibrated',
  requiredFor3d: true,
  status: 'pending',
  baselinePlanFingerprint,
  baselineTargetFingerprints: floorPlanReviewTargetFingerprints(SAMPLE_PLAN),
})

describe('근거 기반 평면도 검수', () => {
  it('배열 순서가 달라도 같은 도면이고 구조가 바뀌면 다른 fingerprint다', () => {
    const reordered = {
      ...SAMPLE_PLAN,
      walls: [...SAMPLE_PLAN.walls].reverse(),
      rooms: [...SAMPLE_PLAN.rooms].reverse(),
      openings: [...SAMPLE_PLAN.openings].reverse(),
    }
    const changed = {
      ...SAMPLE_PLAN,
      walls: SAMPLE_PLAN.walls.map((wall, index) =>
        index === 0 ? { ...wall, b: { ...wall.b, x: wall.b.x + 100 } } : wall
      ),
    }

    expect(floorPlanFingerprint(reordered)).toBe(floorPlanFingerprint(SAMPLE_PLAN))
    expect(floorPlanFingerprint(changed)).not.toBe(floorPlanFingerprint(SAMPLE_PLAN))
  })

  it('실제 구조 변경이 있을 때만 수정 완료 근거를 인정한다', () => {
    const unchanged = validateFloorPlanReviewEvidence(SAMPLE_PLAN, review(), {
      targetKind: 'wall',
      targetId: SAMPLE_PLAN.walls[0].id,
      decision: 'modified',
      note: '원본에 맞게 벽을 수정했습니다.',
    })
    const changedPlan = {
      ...SAMPLE_PLAN,
      walls: SAMPLE_PLAN.walls.map((wall, index) =>
        index === 0 ? { ...wall, thickness: wall.thickness + 10 } : wall
      ),
    }
    const changed = validateFloorPlanReviewEvidence(changedPlan, review(), {
      targetKind: 'wall',
      targetId: changedPlan.walls[0].id,
      decision: 'modified',
      note: '원본에 맞게 벽 두께를 수정했습니다.',
    })
    const unrelatedPlan = {
      ...SAMPLE_PLAN,
      walls: SAMPLE_PLAN.walls.map((wall, index) =>
        index === 1 ? { ...wall, thickness: wall.thickness + 10 } : wall
      ),
    }
    const unrelated = validateFloorPlanReviewEvidence(unrelatedPlan, review(), {
      targetKind: 'wall',
      targetId: unrelatedPlan.walls[0].id,
      decision: 'modified',
      note: '첫 번째 벽을 수정했다고 기록합니다.',
    })

    expect(unchanged).toEqual({ ok: false, reason: 'plan-change-required' })
    expect(changed).toMatchObject({ ok: true })
    expect(unrelated).toEqual({ ok: false, reason: 'plan-change-required' })
  })

  it('벽·방·문·실측 대표 요소를 현재 도면에서 확인 가능한 문구로 만든다', () => {
    expect(floorPlanReviewTargetLabel(SAMPLE_PLAN, 'wall', SAMPLE_PLAN.walls[0].id)).toMatch(
      /벽 1.*mm/
    )
    expect(floorPlanReviewTargetLabel(SAMPLE_PLAN, 'room', SAMPLE_PLAN.rooms[0].id)).toContain(
      SAMPLE_PLAN.rooms[0].name
    )
    expect(floorPlanReviewTargetLabel(SAMPLE_PLAN, 'opening', SAMPLE_PLAN.openings[0].id)).toMatch(
      /문|창문|출입문/
    )
    expect(floorPlanReviewTargetLabel(SAMPLE_PLAN, 'scale')).toMatch(/실측 가로.*mm/)
    expect(floorPlanReviewTargetLabel(SAMPLE_PLAN, 'wall', 'missing')).toBeNull()
  })

  it('근거가 없는 과거 완료 표시는 3D 잠금을 해제하지 않는다', () => {
    const legacyCompleted = { ...review(), status: 'completed' as const }
    const completed = {
      ...legacyCompleted,
      evidence: {
        targetKind: 'scale' as const,
        targetLabel: '실측 가로 10,600mm',
        decision: 'no-change' as const,
        note: '도면 표기 치수와 일치합니다.',
        planFingerprint: floorPlanFingerprint(SAMPLE_PLAN),
        recordedAt: '2026-08-31T05:00:00.000Z',
      },
    }

    expect(isFloorPlanReviewComplete(legacyCompleted)).toBe(false)
    expect(floorPlanReviewBlocks3d('cv', legacyCompleted)).toBe(true)
    expect(isFloorPlanReviewComplete(completed)).toBe(true)
    expect(floorPlanReviewBlocks3d('cv', completed)).toBe(false)
  })
})
