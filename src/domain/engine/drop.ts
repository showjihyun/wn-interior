// ─────────────────────────────────────────────────────────────
// Drop 유효성 검사 (순수함수) — 이동 완료/신규 배치 확정 시 호출
// ─────────────────────────────────────────────────────────────
import type { FloorPlan, Placement, Product } from '../model'
import { footprintAABB, aabbOverlap, pointInPolygon, roomAt } from './geom'
import { resolveAuthoritativePlacementGeometry } from '../authoritativePlacementGeometry'

export interface DropResult {
  ok: boolean
  reason?: 'out-of-room' | 'collision'
}

function footprintCorners(
  width: number,
  depth: number,
  x: number,
  z: number,
  rotY: number
): Array<{ x: number; z: number }> {
  const radians = (rotY * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const halfWidth = Math.max(0, width / 2 - 1)
  const halfDepth = Math.max(0, depth / 2 - 1)
  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([localX, localZ]) => ({
    x: x + localX * cos - localZ * sin,
    z: z + localX * sin + localZ * cos,
  }))
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
  const room = roomAt(plan, x, z)
  if (!room) return { ok: false, reason: 'out-of-room' }

  const selfGeometry = resolveAuthoritativePlacementGeometry(product)
  if (
    product.mount === 'floor' &&
    footprintCorners(selfGeometry.dims.w, selfGeometry.dims.d, x, z, rotY).some(
      (corner) => !pointInPolygon(corner.x, corner.z, room.polygon)
    )
  ) {
    return { ok: false, reason: 'out-of-room' }
  }
  if (selfGeometry.blocksFloor) {
    // 러그처럼 얇은 바닥재성 제품은 겹침 허용 (높이 50mm 이하)
    const selfBox = footprintAABB(selfGeometry.dims.w, selfGeometry.dims.d, x, z, rotY)
    for (const other of placements) {
      if (other.id === selfId) continue
      const op = productOf(other.productId)
      if (!op) continue
      const otherGeometry = resolveAuthoritativePlacementGeometry(op, other)
      if (!otherGeometry.blocksFloor) continue
      const ob = footprintAABB(
        otherGeometry.dims.w,
        otherGeometry.dims.d,
        other.pos.x,
        other.pos.z,
        other.rotY
      )
      if (aabbOverlap(selfBox, ob)) return { ok: false, reason: 'collision' }
    }
  }

  return { ok: true }
}
