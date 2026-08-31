import type {
  FloorPlan,
  FloorPlanReview,
  FloorPlanReviewEvidenceInput,
  FloorPlanReviewTargetKind,
  Project,
} from './model'
import { getPlanBounds } from './planBounds'

export const MIN_FLOOR_PLAN_REVIEW_NOTE_LENGTH = 5

function stablePlanJson(plan: FloorPlan): string {
  const byId = <T extends { id: string }>(items: T[]) =>
    [...items].sort((a, b) => a.id.localeCompare(b.id))
  return JSON.stringify({
    unit: plan.unit,
    wallHeight: plan.wallHeight,
    walls: byId(plan.walls),
    openings: byId(plan.openings),
    rooms: byId(plan.rooms),
  })
}

function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function floorPlanFingerprint(plan: FloorPlan): string {
  return `plan-${hashText(stablePlanJson(plan))}`
}

const hashValue = (value: unknown): string => hashText(JSON.stringify(value))

export function floorPlanReviewTargetKey(
  targetKind: FloorPlanReviewTargetKind,
  targetId?: string
): string {
  return targetId ? `${targetKind}:${targetId}` : targetKind
}

function floorPlanReviewTargetFingerprint(
  plan: FloorPlan,
  targetKind: FloorPlanReviewTargetKind,
  targetId?: string
): string | null {
  if (targetKind === 'scale') {
    const bounds = getPlanBounds(plan)
    return bounds ? hashValue({ width: bounds.maxX - bounds.minX }) : null
  }
  if (!targetId) return null
  const target =
    targetKind === 'wall'
      ? plan.walls.find((item) => item.id === targetId)
      : targetKind === 'room'
        ? plan.rooms.find((item) => item.id === targetId)
        : plan.openings.find((item) => item.id === targetId)
  return target ? hashValue(target) : null
}

export function floorPlanReviewTargetFingerprints(plan: FloorPlan): Record<string, string> {
  const entries: Array<[string, string]> = []
  const add = (kind: FloorPlanReviewTargetKind, id?: string) => {
    const fingerprint = floorPlanReviewTargetFingerprint(plan, kind, id)
    if (fingerprint) entries.push([floorPlanReviewTargetKey(kind, id), fingerprint])
  }
  plan.walls.forEach((wall) => add('wall', wall.id))
  plan.rooms.forEach((room) => add('room', room.id))
  plan.openings.forEach((opening) => add('opening', opening.id))
  add('scale')
  return Object.fromEntries(entries)
}

export function hasFloorPlanReviewTargetChanged(
  plan: FloorPlan,
  review: FloorPlanReview,
  targetKind: FloorPlanReviewTargetKind,
  targetId?: string
): boolean {
  const planFingerprint = floorPlanFingerprint(plan)
  const targetKey = floorPlanReviewTargetKey(targetKind, targetId)
  const currentTargetFingerprint = floorPlanReviewTargetFingerprint(plan, targetKind, targetId)
  const baselineTargetFingerprint = review.baselineTargetFingerprints?.[targetKey]
  return baselineTargetFingerprint
    ? currentTargetFingerprint !== baselineTargetFingerprint
    : planFingerprint !== (review.baselinePlanFingerprint ?? planFingerprint)
}

export function isFloorPlanReviewComplete(review?: FloorPlanReview): boolean {
  return (
    review?.status === 'completed' &&
    !!review.evidence &&
    review.evidence.note.trim().length >= MIN_FLOOR_PLAN_REVIEW_NOTE_LENGTH
  )
}

export function floorPlanReviewBlocks3d(
  origin: Project['origin'],
  review?: FloorPlanReview
): boolean {
  return !!review && (origin === 'cv' || review.requiredFor3d) && !isFloorPlanReviewComplete(review)
}

export function floorPlanReviewTargetLabel(
  plan: FloorPlan,
  targetKind: FloorPlanReviewTargetKind,
  targetId?: string
): string | null {
  if (targetKind === 'scale') {
    const bounds = getPlanBounds(plan)
    return bounds
      ? `실측 가로 ${Math.round(bounds.maxX - bounds.minX).toLocaleString('ko-KR')}mm`
      : null
  }
  if (!targetId) return null
  if (targetKind === 'wall') {
    const index = plan.walls.findIndex((wall) => wall.id === targetId)
    if (index < 0) return null
    const wall = plan.walls[index]
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
    return `벽 ${index + 1} · ${Math.round(length).toLocaleString('ko-KR')}mm`
  }
  if (targetKind === 'room') {
    const room = plan.rooms.find((candidate) => candidate.id === targetId)
    return room ? `방 · ${room.name}` : null
  }
  const index = plan.openings.findIndex((opening) => opening.id === targetId)
  if (index < 0) return null
  const opening = plan.openings[index]
  const kind = opening.type === 'window' ? '창문' : opening.type === 'entry' ? '출입문' : '문'
  return `${kind} ${index + 1} · 폭 ${Math.round(opening.width).toLocaleString('ko-KR')}mm`
}

export type FloorPlanReviewValidation =
  | { ok: true; targetLabel: string; note: string; planFingerprint: string }
  | {
      ok: false
      reason: 'evidence-required' | 'target-not-found' | 'note-too-short' | 'plan-change-required'
    }

export function validateFloorPlanReviewEvidence(
  plan: FloorPlan,
  review: FloorPlanReview,
  input?: FloorPlanReviewEvidenceInput
): FloorPlanReviewValidation {
  if (!input) return { ok: false, reason: 'evidence-required' }
  const targetLabel = floorPlanReviewTargetLabel(plan, input.targetKind, input.targetId)
  if (!targetLabel) return { ok: false, reason: 'target-not-found' }
  const note = input.note.trim()
  if (note.length < MIN_FLOOR_PLAN_REVIEW_NOTE_LENGTH) {
    return { ok: false, reason: 'note-too-short' }
  }
  const planFingerprint = floorPlanFingerprint(plan)
  if (input.decision === 'modified') {
    if (!hasFloorPlanReviewTargetChanged(plan, review, input.targetKind, input.targetId)) {
      return { ok: false, reason: 'plan-change-required' }
    }
  }
  return { ok: true, targetLabel, note, planFingerprint }
}
