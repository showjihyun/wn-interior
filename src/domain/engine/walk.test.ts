// 계약 테스트 — 워크스루 충돌 해석 (원-AABB, 축별 슬라이드)
import { describe, it, expect } from 'vitest'
import {
  blockedByObstacles,
  resolveWalkMove,
  resolveWalkVertical,
  type Obstacle,
  type WallLine,
} from './walk'

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

  it('발이 가구 상단보다 높으면 점프로 넘어갈 수 있다', () => {
    const platform = { ...box, topY: 800 }
    expect(blockedByObstacles([platform], 6000, 4600, R, 500)).toBe(true)
    expect(blockedByObstacles([platform], 6000, 4600, R, 810)).toBe(false)
  })
})

describe('resolveWalkVertical (점프·중력·가구 착지)', () => {
  const platform: Obstacle = { minX: 1000, maxX: 2000, minZ: 1000, maxZ: 2000, topY: 800 }

  it('지상 Space는 상승 속도를 만들고 공중 Space는 이단 점프하지 않는다', () => {
    const jumped = resolveWalkVertical({ y: 0, velocityY: 0, grounded: true }, [], 0, 0, 0.05, true)
    expect(jumped.y).toBeGreaterThan(0)
    expect(jumped.velocityY).toBeGreaterThan(0)
    expect(jumped.grounded).toBe(false)

    const repeated = resolveWalkVertical(jumped, [], 0, 0, 0.05, true)
    expect(repeated.velocityY).toBeLessThan(jumped.velocityY)
  })

  it('하강 중 가구 상단을 통과하면 그 위에 착지한다', () => {
    const landed = resolveWalkVertical(
      { y: 900, velocityY: -2500, grounded: false },
      [platform],
      1500,
      1500,
      0.1,
      false
    )
    expect(landed).toEqual({ y: 800, velocityY: 0, grounded: true })
  })

  it('가구 위에서 옆으로 나가면 바닥으로 낙하한다', () => {
    const falling = resolveWalkVertical(
      { y: 800, velocityY: 0, grounded: true },
      [platform],
      2500,
      1500,
      0.05,
      false
    )
    expect(falling.y).toBeLessThan(800)
    expect(falling.velocityY).toBeLessThan(0)
    expect(falling.grounded).toBe(false)
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
