// ─────────────────────────────────────────────────────────────
// Drop 유효성 검사 (순수함수) — 이동 완료/신규 배치 확정 시 호출
// ─────────────────────────────────────────────────────────────
import type { FloorPlan, Placement, Product } from '../types'
import { footprintAABB, aabbOverlap, roomAt } from './geom'

export interface DropResult {
  ok: boolean
  reason?: 'out-of-room' | 'collision'
}

/**
 * 지정 좌표에 배치 가능한지 검사
 * - 방 밖(어떤 방 폴리곤에도 속하지 않음) → out-of-room
 * - 다른 floor 가구와 AABB 겹침 → collision (러그 등 바닥재성 얇은 제품 제외)
 * - wall-mount/ceiling 제품은 바닥 충돌 판정 제외
 */
export function canDropAt(
  plan: FloorPlan,
  product: Product,
  placements: Placement[],
  selfId: string | null,
  x: number,
  z: number,
  rotY: number,
  productOf: (id: string) => Product | undefined
): DropResult {
  if (!roomAt(plan, x, z)) return { ok: false, reason: 'out-of-room' }

  if (product.mount === 'floor') {
    // 러그처럼 얇은 바닥재성 제품은 겹침 허용 (높이 50mm 이하)
    const flat = product.dims.h <= 50
    if (!flat) {
      const selfBox = footprintAABB(product.dims.w, product.dims.d, x, z, rotY)
      for (const other of placements) {
        if (other.id === selfId) continue
        const op = productOf(other.productId)
        if (!op || op.mount !== 'floor' || op.dims.h <= 50) continue
        const ob = footprintAABB(op.dims.w, op.dims.d, other.pos.x, other.pos.z, other.rotY)
        if (aabbOverlap(selfBox, ob)) return { ok: false, reason: 'collision' }
      }
    }
  }

  return { ok: true }
}
