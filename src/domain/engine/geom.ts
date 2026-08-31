// ─────────────────────────────────────────────────────────────
// 지오메트리 유틸 — 단위 mm
// ─────────────────────────────────────────────────────────────
import type { FloorPlan, Product, Pt, Wall } from '../model'

export function wallLength(w: Wall): number {
  return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
}

export function wallAngle(w: Wall): number {
  return Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
}

/** 벽 시작점에서 offset 떨어진 점 */
export function pointOnWall(w: Wall, offset: number): Pt {
  const len = wallLength(w) || 1
  const t = Math.max(0, Math.min(1, offset / len))
  return { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }
}

/** 점→선분 투영 */
export function projectOnSegment(
  p: Pt,
  a: Pt,
  b: Pt
): { dist: number; t: number; cx: number; cy: number } {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby || 1
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + abx * t
  const cy = a.y + aby * t
  return { dist: Math.hypot(p.x - cx, p.y - cy), t, cx, cy }
}

export function snapGrid(v: number, grid = 50): number {
  return Math.round(v / grid) * grid
}

/** 배치물의 회전 반영 AABB (충돌 판정용) */
export interface AABB {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function footprintAABB(w: number, d: number, cx: number, cz: number, rotYDeg: number): AABB {
  const r = (rotYDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(r))
  const sin = Math.abs(Math.sin(r))
  const hw = (w * cos + d * sin) / 2
  const hd = (w * sin + d * cos) / 2
  return { minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd }
}

export function aabbOverlap(a: AABB, b: AABB, tol = 20): boolean {
  return (
    a.minX < b.maxX - tol && b.minX < a.maxX - tol && a.minZ < b.maxZ - tol && b.minZ < a.maxZ - tol
  )
}

/** 가장 가까운 벽 정보 (벽 부착 스냅용) */
export interface WallSnap {
  wallId: string
  dist: number
  /** 벽 방향각(rad) */
  angle: number
  /** 벽 위 투영점 */
  point: Pt
  /** 벽 시작점부터의 거리 */
  offset: number
  /** 점이 있는 쪽을 향한 벽 수직 방향 단위벡터 */
  normal: { x: number; y: number }
}

export function nearestWall(plan: FloorPlan, p: Pt, maxDist = 800): WallSnap | null {
  let best: WallSnap | null = null
  for (const w of plan.walls) {
    const { dist, t, cx, cy } = projectOnSegment(p, w.a, w.b)
    if (!best || dist < best.dist) {
      const ang = wallAngle(w)
      const nx = -Math.sin(ang)
      const ny = Math.cos(ang)
      // p가 어느 쪽 면인지
      const side = (p.x - cx) * nx + (p.y - cy) * ny >= 0 ? 1 : -1
      best = {
        wallId: w.id,
        dist,
        angle: ang,
        point: { x: cx, y: cy },
        offset: t * wallLength(w),
        normal: { x: nx * side, y: ny * side },
      }
    }
  }
  if (best && best.dist <= maxDist) return best
  return null
}

export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function polygonArea(poly: Pt[]): number {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j].x - poly[i].x) * (poly[j].y + poly[i].y)
  }
  return Math.abs(a / 2)
}

/** 점이 속한 방 (겹치면 더 작은 방 우선) */
export function roomAt(plan: FloorPlan, x: number, z: number) {
  const hits = plan.rooms.filter((r) => pointInPolygon(x, z, r.polygon))
  hits.sort((p, q) => polygonArea(p.polygon) - polygonArea(q.polygon))
  return hits[0]
}

export interface SnapResult {
  x: number
  z: number
  rotY: number
  roomId?: string
  snappedWall: boolean
}

/**
 * 배치 스냅 엔진 (순수함수)
 * - 전체: 25mm 그리드 스냅
 * - 벽부착(snapToWall) 제품: 700mm 내 최근접 벽에 뒷면 밀착 + 정면이 실내를 향하도록 회전
 */
export function snapPlacement(
  plan: FloorPlan,
  prod: Product,
  x: number,
  z: number,
  currentRotY: number
): SnapResult {
  let rx = snapGrid(x, 25)
  let rz = snapGrid(z, 25)
  let rotY = currentRotY
  let snappedWall = false

  if (prod.snapToWall && prod.mount !== 'ceiling') {
    const snap = nearestWall(plan, { x, y: z }, 700)
    if (snap) {
      const backOut = prod.dims.d / 2 // 뒷면(-z)이 벽 표면에 닿도록
      let nx = snap.normal.x
      let ny = snap.normal.y
      let cx = snap.point.x + nx * backOut
      let cz = snap.point.y + ny * backOut
      // 스냅 위치가 방 밖이면(벽 바깥면 클릭) 노멀을 실내 쪽으로 반전
      if (!roomAt(plan, cx, cz)) {
        nx = -nx
        ny = -ny
        cx = snap.point.x + nx * backOut
        cz = snap.point.y + ny * backOut
        // 반전해도 밖이면(코너 밖 클릭 등) 벽스냅 포기 — 그리드 위치 유지
        if (!roomAt(plan, cx, cz)) {
          const room = roomAt(plan, rx, rz)
          return { x: rx, z: rz, rotY, roomId: room?.id, snappedWall: false }
        }
      }
      rx = cx
      rz = cz
      rotY = (Math.atan2(nx, ny) * 180) / Math.PI
      snappedWall = true
    }
  }

  const room = roomAt(plan, rx, rz)
  return { x: rx, z: rz, rotY, roomId: room?.id, snappedWall }
}
