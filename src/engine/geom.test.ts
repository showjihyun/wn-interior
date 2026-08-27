import { describe, it, expect } from 'vitest'
import {
  wallLength,
  pointOnWall,
  projectOnSegment,
  snapGrid,
  footprintAABB,
  aabbOverlap,
  nearestWall,
  pointInPolygon,
  polygonArea,
  roomAt,
  snapPlacement,
} from './geom'
import { SAMPLE_PLAN } from '../data/samplePlan'

describe('wallLength / pointOnWall', () => {
  it('벽 길이를 mm로 계산한다', () => {
    const w = SAMPLE_PLAN.walls.find((x) => x.id === 'w-n')!
    expect(wallLength(w)).toBe(10600)
  })
  it('offset 지점의 좌표를 반환하고 범위를 클램프한다', () => {
    const w = { id: 't', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, thickness: 100 }
    expect(pointOnWall(w, 500)).toEqual({ x: 500, y: 0 })
    expect(pointOnWall(w, 9999)).toEqual({ x: 1000, y: 0 }) // 클램프
    expect(pointOnWall(w, -50)).toEqual({ x: 0, y: 0 })
  })
})

describe('projectOnSegment', () => {
  it('선분 위 투영점과 거리를 반환한다', () => {
    const r = projectOnSegment({ x: 500, y: 300 }, { x: 0, y: 0 }, { x: 1000, y: 0 })
    expect(r.dist).toBe(300)
    expect(r.cx).toBe(500)
    expect(r.cy).toBe(0)
  })
  it('선분 밖 끝점으로 클램프된다', () => {
    const r = projectOnSegment({ x: 2000, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 })
    expect(r.cx).toBe(1000)
    expect(r.dist).toBe(1000)
  })
})

describe('snapGrid', () => {
  it('그리드 간격으로 반올림한다', () => {
    expect(snapGrid(124, 50)).toBe(100)
    expect(snapGrid(126, 50)).toBe(150)
    expect(snapGrid(-30, 50)).toBe(-50)
  })
})

describe('footprintAABB / aabbOverlap', () => {
  it('회전 없는 직사각형 AABB', () => {
    const b = footprintAABB(2000, 1000, 0, 0, 0)
    expect(b).toEqual({ minX: -1000, maxX: 1000, minZ: -500, maxZ: 500 })
  })
  it('90도 회전 시 w/d가 교환된다', () => {
    const b = footprintAABB(2000, 1000, 0, 0, 90)
    expect(b.maxX - b.minX).toBeCloseTo(1000)
    expect(b.maxZ - b.minZ).toBeCloseTo(2000)
  })
  it('겹침 판정 — 접촉(여유 20mm)은 겹침 아님', () => {
    const a = footprintAABB(1000, 1000, 0, 0, 0)
    const touch = footprintAABB(1000, 1000, 1020, 0, 0) // 간격 20mm
    const overlap = footprintAABB(1000, 1000, 900, 0, 0)
    expect(aabbOverlap(a, touch)).toBe(false)
    expect(aabbOverlap(a, overlap)).toBe(true)
  })
})

describe('pointInPolygon / polygonArea', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ]
  it('내부/외부 판정', () => {
    expect(pointInPolygon(500, 500, square)).toBe(true)
    expect(pointInPolygon(1500, 500, square)).toBe(false)
  })
  it('면적(m㎡)', () => {
    expect(polygonArea(square)).toBe(1_000_000)
  })
})

describe('nearestWall', () => {
  it('가장 가까운 벽과 수직 노멀을 반환한다', () => {
    // 북벽(w-n: y=0 가로벽) 근처 점
    const s = nearestWall(SAMPLE_PLAN, { x: 2000, y: 300 })!
    expect(s.wallId).toBe('w-n')
    expect(s.dist).toBe(300)
    // 북벽 아래쪽 면 → 노멀은 +y 방향
    expect(s.normal.y).toBeGreaterThan(0)
  })
  it('maxDist 밖이면 null', () => {
    expect(nearestWall(SAMPLE_PLAN, { x: 20000, y: 20000 }, 800)).toBeNull()
  })
})

describe('roomAt', () => {
  it('좌표가 속한 방을 찾는다', () => {
    expect(roomAt(SAMPLE_PLAN, 2300, 2300)?.id).toBe('r-master') // 안방
    expect(roomAt(SAMPLE_PLAN, 8000, 4000)?.id).toBe('r-living') // 거실
    expect(roomAt(SAMPLE_PLAN, 1400, 6000)?.id).toBe('r-bed2')
  })
})

describe('snapPlacement (배치 스냅 엔진)', () => {
  const wallProduct = {
    id: 'p1',
    name: '싱크대',
    category: 'kitchen' as const,
    dims: { w: 2400, d: 600, h: 850 },
    mount: 'floor' as const,
    snapToWall: true,
    shape: 'sinkLower' as const,
  }
  const freeProduct = { ...wallProduct, snapToWall: false }

  it('일반 제품은 25mm 그리드로 스냅된다', () => {
    const r = snapPlacement(SAMPLE_PLAN, freeProduct, 1234, 1267, 30)
    expect(r.x).toBe(1225) // 1234 → 최근접 25mm 경계
    expect(r.z % 25).toBe(0)
    expect(r.rotY).toBe(30) // 회전 유지
    expect(r.roomId).toBeTruthy()
  })

  it('벽부착 제품은 북벽에 밀착하고 정면이 남쪽(+y)을 향한다', () => {
    // 북벽(y=0) 안쪽 근처
    const r = snapPlacement(SAMPLE_PLAN, wallProduct, 2000, 400, 45)
    expect(r.snappedWall).toBe(true)
    expect(r.rotY).toBeCloseTo(0, 5) // 노멀 (0,+y) → 0°
    expect(r.z).toBeCloseTo(wallProduct.dims.d / 2, 0) // 뒷면이 벽면(y≈0)에 접촉
    expect(r.roomId).toBe('r-master') // x<4600, y<4600 영역
  })

  it('동벽 서쪽 면에 붙으면 정면이 서쪽(-x), rotY=-90이다', () => {
    const r = snapPlacement(SAMPLE_PLAN, wallProduct, 10200, 4000, 0)
    expect(r.snappedWall).toBe(true)
    expect(r.rotY).toBe(-90)
    expect(r.x).toBeLessThan(10600)
    expect(r.x).toBeGreaterThan(10600 - wallProduct.dims.d - 10)
  })

  it('허용 거리(700mm)를 벗어나면 벽스냅하지 않는다', () => {
    const r = snapPlacement(SAMPLE_PLAN, wallProduct, 6800, 5000, 25)
    expect(r.snappedWall).toBe(false)
    expect(r.rotY).toBe(25)
  })

  it('천장 부착 제품은 벽스냅하지 않는다', () => {
    const pend = { ...freeProduct, snapToWall: true, mount: 'ceiling' as const }
    const r = snapPlacement(SAMPLE_PLAN, pend, 2000, 300, 0)
    expect(r.snappedWall).toBe(false)
  })

  it('벽 바깥쪽에서 클릭해도 실내 쪽 면으로 붙는다 (노멀 자동 반전)', () => {
    // 북벽 바깥(y<0)에서 클릭 → 스냅 결과는 반드시 실내(z>0), 정면 남향
    const r = snapPlacement(SAMPLE_PLAN, wallProduct, 2000, -100, 45)
    expect(r.snappedWall).toBe(true)
    expect(r.z).toBeGreaterThan(0)
    expect(roomAt(SAMPLE_PLAN, r.x, r.z)?.id).toBeTruthy()
    // 동벽 바깥(x>10600) 클릭도 실내로
    const r2 = snapPlacement(SAMPLE_PLAN, wallProduct, 10900, 4000, 0)
    expect(r2.snappedWall).toBe(true)
    expect(r2.x).toBeLessThan(10600)
  })
})
