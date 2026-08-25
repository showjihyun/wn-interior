// 워크스루 캐릭터 충돌 해석 - 원(circle) vs 벽선분/AABB, 축별 슬라이드
import type { Pt } from '../types'
import { projectOnSegment } from './geom'

export interface WallLine {
  a: Pt
  b: Pt
  thickness: number
}

export interface Obstacle {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface WalkBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** 캐릭터(원, 반경 r)가 장애물 AABB와 겹치는가 */
export function blockedByObstacles(obs: Obstacle[], x: number, z: number, r: number): boolean {
  for (const o of obs) {
    const cx = Math.max(o.minX, Math.min(x, o.maxX))
    const cz = Math.max(o.minZ, Math.min(z, o.maxZ))
    const dx = x - cx
    const dz = z - cz
    if (dx * dx + dz * dz < r * r) return true
  }
  return false
}

function hitWall(walls: WallLine[], x: number, z: number, r: number): boolean {
  for (const w of walls) {
    const { dist } = projectOnSegment({ x, y: z }, w.a, w.b)
    if (dist < w.thickness / 2 + r) return true
  }
  return false
}

const inBounds = (b: WalkBounds, x: number, z: number, r: number) =>
  x >= b.minX - r && x <= b.maxX + r && z >= b.minZ - r && z <= b.maxZ + r

/**
 * 이동 해석: x/z 축을 개별 검사해 막힌 축만 차단(슬라이드).
 * 벽(선분+두께) + 장애물 AABB + 도면 경계 모두 적용.
 */
export function resolveWalkMove(
  walls: WallLine[],
  obstacles: Obstacle[],
  from: { x: number; z: number },
  dx: number,
  dz: number,
  radius: number,
  bounds: WalkBounds,
): { x: number; z: number } {
  let { x, z } = from
  const nx = x + dx
  if (!hitWall(walls, nx, z, radius) && !blockedByObstacles(obstacles, nx, z, radius) && inBounds(bounds, nx, z, radius))
    x = nx
  const nz = z + dz
  if (!hitWall(walls, x, nz, radius) && !blockedByObstacles(obstacles, x, nz, radius) && inBounds(bounds, x, nz, radius))
    z = nz
  return { x, z }
}
