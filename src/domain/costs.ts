// ─────────────────────────────────────────────────────────────
// 가격 리포트 — 배치 제품 합산 (출처 기반 참고가격, 미확인은 분리 표기)
// ─────────────────────────────────────────────────────────────
import type { Placement, Product } from './model'

export interface CostLine {
  productId: string
  name: string
  brand?: string
  qty: number
  unitPrice: number
  subtotal: number
  sourceUrl?: string
  priceNote?: string
}

export interface CostReport {
  lines: CostLine[]
  pricedTotal: number
  /** 가격 미확인(견적 필요) 항목 */
  unpriced: { productId: string; name: string; qty: number }[]
  /** 카탈로그에서 찾지 못해 합계에 포함할 수 없는 항목 */
  unresolvedProducts: { productId: string; qty: number }[]
}

export function buildCostReport(
  placements: Placement[],
  productOf: (id: string) => Product | undefined
): CostReport {
  const byProduct = new Map<string, number>()
  for (const pl of placements) {
    byProduct.set(pl.productId, (byProduct.get(pl.productId) ?? 0) + 1)
  }

  const lines: CostLine[] = []
  const unpriced: CostReport['unpriced'] = []
  const unresolvedProducts: CostReport['unresolvedProducts'] = []
  let pricedTotal = 0

  for (const [productId, qty] of byProduct) {
    const p = productOf(productId)
    if (!p) {
      unresolvedProducts.push({ productId, qty })
      continue
    }
    if (typeof p.price === 'number' && p.price > 0) {
      const subtotal = p.price * qty
      lines.push({
        productId,
        name: p.name,
        brand: p.brand,
        qty,
        unitPrice: p.price,
        subtotal,
        sourceUrl: p.sourceUrl,
        priceNote: p.priceNote,
      })
      pricedTotal += subtotal
    } else {
      unpriced.push({ productId, name: p.name, qty })
    }
  }

  lines.sort((a, b) => b.subtotal - a.subtotal)
  return { lines, pricedTotal, unpriced, unresolvedProducts }
}
