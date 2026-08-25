// TDD RED - 워크스루 캐릭터 충돌 해석 (원-AABB, 축별 슬라이드)
import { describe, it, expect } from 'vitest'
import { blockedByObstacles, resolveWalkMove, type Obstacle, type WallLine } from './walk'

const walls: WallLine[] = [
  { a: { x: 0, y: 0 }, b: { x: 10000, y: 0 }, thickness: 200 },
  { a: { x: 10000, y: 0 }, b: { x: 10000, y: 10000 }, thickness: 200 },
  { a: { x: 10000, y: 10000 }, b: { x: 0, y: 10000 }, thickness: 200 },
  { a: { x: 0, y: 10000 }, b: { x: 0, y: 0 }, thickness: 200 },
]
const bounds = { minX: 0, maxX: 10000, minZ: 0, maxZ: 10000 }
const R = 150

describe('blockedByObstacles (원 vs AABB)', () => {
  const box: Obstacle = { minX: 5000, maxX: 7100, minZ: 4000, maxZ: 4950 }
  it('원이 AABB와 겹치면 차단', () => {
    expect(blockedByObstacles([box], 6000, 4600, R)).toBe(true)
  })
  it('AABB에서 반경 이상 떨어지면 통과', () => {
    expect(blockedByObstacles([box], 6000, 4950 + R + 1, R)).toBe(false)
  })
  it('모서리 근처 대각 접근도 원-코너 거리로 판정', () => {
    expect(blockedByObstacles([box], 5000 - R * 0.6, 4000 - R * 0.6, R)).toBe(true)
  })
})

describe('resolveWalkMove (축별 슬라이드 이동)', () => {
  const sofa: Obstacle = { minX: 5750, maxX: 7850, minZ: 3825, maxZ: 4775 }
  it('빈 공간은 자유 이동', () => {
    const r = resolveWalkMove(walls, [], { x: 5000, z: 7000 }, 0, -500, R, bounds)
    expect(r).toEqual({ x: 5000, z: 6500 })
  })
  it('가구와 겹치는 이동은 그 축만 차단(슬라이드)', () => {
    const r = resolveWalkMove(walls, [sofa], { x: 6800, z: 5600 }, 0, -400, R, bounds)
    expect(r.z).toBeGreaterThanOrEqual(sofa.maxZ + R - 1)
    expect(r.x).toBe(6800)
  })
  it('대각 이동 중 벽을 만나면 막히는 축만 유지', () => {
    // 서쪽 벽 근처에서 서북 이동 → x는 벽에 막히고 z는 진행
    const r = resolveWalkMove(walls, [], { x: 300, z: 5000 }, -600, -400, R, bounds)
    expect(r.x).toBeGreaterThanOrEqual(300 - 1)
    expect(r.z).toBe(4600)
  })
  it('도면 경계 밖으로 못 나간다', () => {
    const r = resolveWalkMove(walls, [], { x: 9900, z: 9900 }, 500, 500, R, bounds)
    expect(r.x).toBeLessThanOrEqual(10000)
    expect(r.z).toBeLessThanOrEqual(10000)
  })
})
