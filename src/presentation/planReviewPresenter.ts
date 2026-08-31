import type { PlanReviewIssue, ScaleAssessment } from '../domain/engine/planReview'

export function scaleAssessmentMessage(scale: ScaleAssessment): string {
  if (scale.mode === 'calibrated') {
    return `실측 가로 ${Math.round(scale.knownWidthMm).toLocaleString('ko-KR')}mm로 축척을 보정합니다.`
  }
  if (scale.mode === 'estimated') {
    return `추정 축척을 사용합니다. 검출 가로 약 ${Math.round(scale.detectedWidthMm).toLocaleString('ko-KR')}mm를 2D에서 반드시 검수하세요.`
  }
  return scale.detectedWidthMm > 0
    ? '도면의 실측 가로를 입력하거나 추정 축척 사용을 확인해야 적용할 수 있습니다.'
    : '벽 외곽 폭을 계산할 수 없습니다. 검출 결과를 먼저 확인하세요.'
}

export function planReviewIssueMessage(issue: PlanReviewIssue): string {
  const messages: Record<Exclude<PlanReviewIssue['id'], 'large-scale-correction'>, string> = {
    'no-walls': '벽을 검출하지 못했습니다.',
    'no-rooms': '방을 검출하지 못했습니다.',
    'few-rooms': '방이 1개만 검출됐습니다. 원본 도면과 방 경계를 비교하세요.',
    'no-openings': '문·창문을 검출하지 못했습니다. 2D 편집기에서 추가하세요.',
    'scale-blocked': '축척 확인이 필요합니다.',
    'estimated-scale': '추정 축척을 사용합니다. 2D에서 반드시 검수하세요.',
  }
  return issue.id === 'large-scale-correction'
    ? `축척을 ${(issue.value ?? 1).toFixed(2)}배 보정합니다. 입력한 실측값을 다시 확인하세요.`
    : messages[issue.id]
}
