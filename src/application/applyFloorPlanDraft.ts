import type { FloorPlan } from '../domain/model'
import type { RawPlan } from '../domain/engine/planVision'
import { sanitizeOpeningCandidates } from '../domain/engine/planReview'
import { normalizeAiPlan } from './normalizeFloorPlan'

export type FloorPlanDraftFailure = 'review-required' | 'normalization-failed'

export class FloorPlanDraftError extends Error {
  constructor(
    public readonly code: FloorPlanDraftFailure,
    public readonly detail?: string
  ) {
    super(code)
    this.name = 'FloorPlanDraftError'
  }
}

export interface ApplyFloorPlanDraftInput {
  draft: RawPlan
  detectedRegionCount: number
  scaleCanApply: boolean
  blockerCount: number
}

export function applyFloorPlanDraft({
  draft,
  detectedRegionCount,
  scaleCanApply,
  blockerCount,
}: ApplyFloorPlanDraftInput): FloorPlan {
  if (detectedRegionCount > 1 || !scaleCanApply || blockerCount > 0) {
    throw new FloorPlanDraftError('review-required')
  }

  const keptOpenings = sanitizeOpeningCandidates(draft.openings)
  const wallIds = keptOpenings.map((opening) => {
    let bestIndex = 0
    let bestDistance = Infinity
    draft.walls.forEach((wall, index) => {
      const dx = wall.b.x - wall.a.x
      const dy = wall.b.y - wall.a.y
      const length2 = dx * dx + dy * dy || 1
      const t = Math.max(
        0,
        Math.min(1, ((opening.at.x - wall.a.x) * dx + (opening.at.y - wall.a.y) * dy) / length2)
      )
      const distance = Math.hypot(
        opening.at.x - (wall.a.x + dx * t),
        opening.at.y - (wall.a.y + dy * t)
      )
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    })
    return `w${bestIndex + 1}`
  })

  const normalized = normalizeAiPlan({
    wallHeight: draft.wallHeight,
    walls: draft.walls,
    openings: keptOpenings.map((opening, index) => ({
      wallId: wallIds[index],
      type: opening.type,
      offset: 0,
      width: opening.width,
      height: opening.type === 'window' ? 1500 : 2000,
      sill: opening.type === 'window' ? 900 : 0,
    })),
    rooms: draft.rooms,
  })
  if (!normalized.ok || !normalized.plan) {
    throw new FloorPlanDraftError('normalization-failed', normalized.error)
  }

  normalized.plan.openings.forEach((opening, index) => {
    const wall = normalized.plan?.walls.find((candidate) => candidate.id === opening.wallId)
    if (!wall) return
    const point = keptOpenings[index].at
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1
    const t =
      ((point.x - wall.a.x) * (wall.b.x - wall.a.x) +
        (point.y - wall.a.y) * (wall.b.y - wall.a.y)) /
      (length * length)
    opening.offset = Math.max(0, Math.min(length - opening.width, t * length))
  })
  return normalized.plan
}
