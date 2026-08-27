import type { RawPlan } from './planVision'

export type ScaleAssessment =
  | {
      mode: 'blocked'
      canApply: false
      detectedWidthMm: number
      message: string
    }
  | {
      mode: 'estimated'
      canApply: true
      detectedWidthMm: number
      correctionFactor: 1
      message: string
    }
  | {
      mode: 'calibrated'
      canApply: true
      detectedWidthMm: number
      knownWidthMm: number
      correctionFactor: number
      message: string
    }

export interface PlanReviewIssue {
  id: string
  severity: 'blocker' | 'warning'
  message: string
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
      message: '벽 외곽 폭을 계산할 수 없습니다. 검출 결과를 먼저 확인하세요.',
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
      message: `실측 가로 ${Math.round(knownWidthMm).toLocaleString('ko-KR')}mm로 축척을 보정합니다.`,
    }
  }

  if (input.acceptEstimatedScale) {
    return {
      mode: 'estimated',
      canApply: true,
      detectedWidthMm,
      correctionFactor: 1,
      message: `추정 축척을 사용합니다. 검출 가로 약 ${Math.round(detectedWidthMm).toLocaleString('ko-KR')}mm를 2D에서 반드시 검수하세요.`,
    }
  }

  return {
    mode: 'blocked',
    canApply: false,
    detectedWidthMm,
    message: '도면의 실측 가로를 입력하거나 추정 축척 사용을 확인해야 적용할 수 있습니다.',
  }
}

export function buildPlanReviewIssues(
  plan: Pick<RawPlan, 'walls' | 'rooms' | 'openings'>,
  scale: ScaleAssessment
): PlanReviewIssue[] {
  const issues: PlanReviewIssue[] = []
  if (plan.walls.length === 0) {
    issues.push({ id: 'no-walls', severity: 'blocker', message: '벽을 검출하지 못했습니다.' })
  }
  if (plan.rooms.length === 0) {
    issues.push({ id: 'no-rooms', severity: 'blocker', message: '방을 검출하지 못했습니다.' })
  } else if (plan.rooms.length === 1) {
    issues.push({
      id: 'few-rooms',
      severity: 'warning',
      message: '방이 1개만 검출됐습니다. 원본 도면과 방 경계를 비교하세요.',
    })
  }
  if (plan.openings.length === 0) {
    issues.push({
      id: 'no-openings',
      severity: 'warning',
      message: '문·창문을 검출하지 못했습니다. 2D 편집기에서 추가하세요.',
    })
  }
  if (scale.mode === 'blocked') {
    issues.push({ id: 'scale-blocked', severity: 'blocker', message: scale.message })
  } else if (scale.mode === 'estimated') {
    issues.push({ id: 'estimated-scale', severity: 'warning', message: scale.message })
  } else if (scale.correctionFactor > 2 || scale.correctionFactor < 0.5) {
    issues.push({
      id: 'large-scale-correction',
      severity: 'warning',
      message: `축척을 ${scale.correctionFactor.toFixed(2)}배 보정합니다. 입력한 실측값을 다시 확인하세요.`,
    })
  }
  return issues
}
