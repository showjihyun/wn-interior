import type { RawPlan } from './planVision'

export type ScaleAssessment =
  | {
      mode: 'blocked'
      canApply: false
      detectedWidthMm: number
    }
  | {
      mode: 'estimated'
      canApply: true
      detectedWidthMm: number
      correctionFactor: 1
    }
  | {
      mode: 'calibrated'
      canApply: true
      detectedWidthMm: number
      knownWidthMm: number
      correctionFactor: number
    }

export interface PlanReviewIssue {
  id:
    | 'no-walls'
    | 'no-rooms'
    | 'few-rooms'
    | 'no-openings'
    | 'scale-blocked'
    | 'estimated-scale'
    | 'large-scale-correction'
  severity: 'blocker' | 'warning'
  value?: number
}

export function sanitizeOpeningCandidates(openings: RawPlan['openings']): RawPlan['openings'] {
  return openings
    .filter(
      (opening) =>
        Number.isFinite(opening.width) &&
        opening.width > 0 &&
        Number.isFinite(opening.at.x) &&
        Number.isFinite(opening.at.y)
    )
    .map((opening) => ({
      ...opening,
      width:
        opening.type === 'door'
          ? Math.max(500, Math.min(2200, opening.width))
          : Math.max(400, Math.min(5000, opening.width)),
    }))
}

export function getPlanWidthMm(plan: Pick<RawPlan, 'walls'>): number {
  const xs = plan.walls
    .flatMap((wall) => [wall.a.x, wall.b.x])
    .filter((value) => Number.isFinite(value))
  if (xs.length < 2) return 0
  const width = Math.max(...xs) - Math.min(...xs)
  return Number.isFinite(width) && width > 0 ? width : 0
}

export function assessScale(input: {
  detectedWidthMm: number
  knownWidthMm: number
  acceptEstimatedScale: boolean
}): ScaleAssessment {
  const detectedWidthMm =
    Number.isFinite(input.detectedWidthMm) && input.detectedWidthMm > 0 ? input.detectedWidthMm : 0
  const knownWidthMm =
    Number.isFinite(input.knownWidthMm) && input.knownWidthMm >= 1000 ? input.knownWidthMm : 0

  if (!detectedWidthMm) {
    return {
      mode: 'blocked',
      canApply: false,
      detectedWidthMm,
    }
  }

  if (knownWidthMm) {
    const correctionFactor = knownWidthMm / detectedWidthMm
    return {
      mode: 'calibrated',
      canApply: true,
      detectedWidthMm,
      knownWidthMm,
      correctionFactor,
    }
  }

  if (input.acceptEstimatedScale) {
    return {
      mode: 'estimated',
      canApply: true,
      detectedWidthMm,
      correctionFactor: 1,
    }
  }

  return {
    mode: 'blocked',
    canApply: false,
    detectedWidthMm,
  }
}

export function buildPlanReviewIssues(
  plan: Pick<RawPlan, 'walls' | 'rooms' | 'openings'>,
  scale: ScaleAssessment
): PlanReviewIssue[] {
  const issues: PlanReviewIssue[] = []
  if (plan.walls.length === 0) {
    issues.push({ id: 'no-walls', severity: 'blocker' })
  }
  if (plan.rooms.length === 0) {
    issues.push({ id: 'no-rooms', severity: 'blocker' })
  } else if (plan.rooms.length === 1) {
    issues.push({
      id: 'few-rooms',
      severity: 'warning',
    })
  }
  if (plan.openings.length === 0) {
    issues.push({
      id: 'no-openings',
      severity: 'warning',
    })
  }
  if (scale.mode === 'blocked') {
    issues.push({ id: 'scale-blocked', severity: 'blocker' })
  } else if (scale.mode === 'estimated') {
    issues.push({ id: 'estimated-scale', severity: 'warning' })
  } else if (scale.correctionFactor > 2 || scale.correctionFactor < 0.5) {
    issues.push({
      id: 'large-scale-correction',
      severity: 'warning',
      value: scale.correctionFactor,
    })
  }
  return issues
}
