// 견적서 마크다운 생성 - 배치 제품 합계 + 방 면적 + 마감재 요약
import type { FloorPlan } from '../domain/model'
import { buildCostReport, type CostReport } from '../domain/costs'
import { polygonArea } from '../domain/engine/geom'

const won = (v: number) => v.toLocaleString('ko-KR') + '원'

export interface QuoteTextContext {
  generatedAt: string
  materialNameOf: (id?: string) => string | undefined
}

export function buildQuoteText(
  projectName: string,
  report: CostReport,
  plan: FloorPlan,
  context: QuoteTextContext
): string {
  const lines: string[] = []

  lines.push(`# 📋 견적서 — ${projectName}`)
  lines.push(
    context.generatedAt
      ? `> 작성: ${context.generatedAt} · 홈플랜 3D 시뮬레이션 기준 (참고 가격)`
      : '> 홈플랜 3D 시뮬레이션 기준 (참고 가격)'
  )
  lines.push('')

  // 면적 요약
  lines.push('## 1. 공간 요약')
  lines.push('')
  lines.push('| 방 | 면적 | 바닥재 | 벽지 |')
  lines.push('|---|---|---|---|')
  let totalM2 = 0
  for (const r of plan.rooms) {
    const m2 = polygonArea(r.polygon) / 1e6
    totalM2 += m2
    const floor = context.materialNameOf(r.floorMaterialId) ?? '-'
    const wall = context.materialNameOf(r.wallMaterialId) ?? '-'
    lines.push(
      `| ${r.name} | ${m2.toFixed(1)}㎡ (${(m2 / 3.3058).toFixed(1)}평) | ${floor} | ${wall} |`
    )
  }
  lines.push(`| **합계** | **${totalM2.toFixed(1)}㎡ (${(totalM2 / 3.3058).toFixed(1)}평)** | | |`)
  lines.push('')

  // 제품
  lines.push('## 2. 배치 제품')
  lines.push('')
  if (report.lines.length > 0) {
    lines.push('| 제품 | 브랜드 | 수량 | 단가 | 소계 | 출처 |')
    lines.push('|---|---|---|---|---|---|')
    for (const l of report.lines) {
      lines.push(
        `| ${l.name} | ${l.brand ?? '-'} | ${l.qty} | ${won(l.unitPrice)} | ${won(l.subtotal)} | ${l.sourceUrl ? `[링크](${l.sourceUrl})` : '-'} |`
      )
    }
  } else {
    lines.push('- 가격 정보가 있는 배치 제품 없음')
  }
  lines.push(`| **참고 가격 합계** | | | | **${won(report.pricedTotal)}** | |`)
  lines.push('')

  if (report.unpriced.length > 0) {
    lines.push('### 가격 미확인 (매장 견적 필요)')
    lines.push('')
    for (const u of report.unpriced) lines.push(`- ${u.name} × ${u.qty}`)
    lines.push('')
  }

  lines.push('---')
  lines.push(
    '*본 견적서는 시뮬레이션 상 참고 가격이며, 실제 옵션·프로모션에 따라 달라질 수 있습니다.*'
  )
  return lines.join('\n')
}

// 순환 참조 없이 비용 리포트 재계산 편의
export function quoteFrom(
  placements: Parameters<typeof buildCostReport>[0],
  productOf: Parameters<typeof buildCostReport>[1],
  plan: FloorPlan,
  projectName: string,
  context: QuoteTextContext
): string {
  return buildQuoteText(projectName, buildCostReport(placements, productOf), plan, context)
}
