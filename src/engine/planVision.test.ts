// TDD RED — CV 도면 변환 코어 (합성 마스크 기반, canvas 불필요)
import { describe, it, expect } from 'vitest'
import { toGray, findWalls, estimateScale, detectRooms, buildPlanFromImage, type Gray } from './planVision'

/** 합성 Gray 생성: draw 콜백으로 픽셀 채움 (255=잉크) */
function makeGray(w: number, h: number, draw: (set: (x: number, y: number) => void) => void): Gray {
  const data = new Uint8Array(w * h)
  draw((x, y) => {
    if (x >= 0 && y >= 0 && x < w && y < h) data[y * w + x] = 255
  })
  return { data, width: w, height: h }
}

/** 두꺼운 선 (직사각형 브러시) */
function thickLine(set: (x: number, y: number) => void, x1: number, y1: number, x2: number, y2: number, t: number) {
  if (y1 === y2) for (let y = y1; y < y1 + t; y++) for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) set(x, y)
  else for (let x = x1; x < x1 + t; x++) for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) set(x, y)
}

describe('toGray (이진화)', () => {
  it('어두운 픽셀만 잉크(255)로', () => {
    const rgba = new Uint8ClampedArray(4 * 3)
    rgba[0] = 20; rgba[1] = 20; rgba[2] = 20 // 어두움 → 잉크
    rgba[4] = 240; rgba[5] = 240; rgba[6] = 240 // 밝음 → 배경
    const g = toGray(rgba, 3, 1, 128)
    expect(g.data[0]).toBe(255)
    expect(g.data[1]).toBe(0)
  })
})

describe('findWalls (H/V 런-밴드 벽 추출)', () => {
  it('두꺼운 벽 2개(H+V)를 검출하고 얇은 치수선은 무시한다', () => {
    const g = makeGray(200, 200, (set) => {
      thickLine(set, 10, 20, 180, 20, 8) // H 벽 (두께 8)
      thickLine(set, 40, 50, 40, 190, 8) // V 벽
      thickLine(set, 10, 120, 180, 120, 2) // 얇은 치수선 (2px → 무시)
    })
    const walls = findWalls(g, { minThicknessPx: 4, minLengthPx: 40 })
    expect(walls).toHaveLength(2)
    const h = walls.find((w) => w.y1 === w.y2)!
    const v = walls.find((w) => w.x1 === w.x2)!
    expect(h.thickness).toBe(8)
    expect(v.thickness).toBe(8)
    expect(h.x2 - h.x1).toBeGreaterThanOrEqual(160)
  })

  it('벽 중앙 갭(문 폭)을 opening 후보로 검출한다', () => {
    const g = makeGray(300, 60, (set) => {
      thickLine(set, 10, 20, 140, 20, 8) // 좌측 벽
      thickLine(set, 240, 20, 290, 20, 8) // 우측 벽 (갭: 141~239 = 99px)
    })
    const walls = findWalls(g, { minThicknessPx: 4, minLengthPx: 40 })
    expect(walls).toHaveLength(2)
    expect(walls[0].openingAfter).toBeTruthy()
    const op = walls[0].openingAfter!
    expect(op.gapPx).toBeGreaterThanOrEqual(90)
    expect(op.gapPx).toBeLessThanOrEqual(110)
  })
})

describe('estimateScale (축척 추정)', () => {
  it('최두꺼 벽을 외벽 기준(mm)으로 mm/px 환산', () => {
    // 두께 8px 벽이 외벽 200mm라면 25mm/px
    const g = makeGray(200, 200, (set) => thickLine(set, 10, 20, 180, 20, 8))
    const walls = findWalls(g, { minThicknessPx: 4, minLengthPx: 40 })
    expect(estimateScale(walls, 200)).toBeCloseTo(25, 1)
  })
})

describe('detectRooms (플러드필 방지 폴리곤)', () => {
  it('닫힌 사각형 벽 내부를 1개 방 폴리곤으로 검출한다', () => {
    const g = makeGray(300, 300, (set) => {
      thickLine(set, 50, 50, 250, 50, 8)
      thickLine(set, 50, 250, 250, 250, 8)
      thickLine(set, 50, 50, 50, 250, 8)
      thickLine(set, 250, 50, 250, 250, 8)
    })
    const walls = findWalls(g, { minThicknessPx: 4, minLengthPx: 40 })
    const rooms = detectRooms(g, walls, { mmPerPx: 10, minAreaM2: 1 })
    expect(rooms).toHaveLength(1)
    const poly = rooms[0].polygon
    expect(poly.length).toBeGreaterThanOrEqual(4) // RDP 후 4코너 근처
    // 대략 내부 영역 (50..250 px → 500..2500mm @10mm/px)
    const xs = poly.map((p) => p.x)
    const ys = poly.map((p) => p.y)
    expect(Math.min(...xs)).toBeGreaterThan(400)
    expect(Math.max(...xs)).toBeLessThan(2600)
  })
})

describe('buildPlanFromImage (전체 파이프라인)', () => {
  it('합성 도면 → 정규화 가능한 plan 구조 생성 (벽/방/문)', () => {
    const g = makeGray(400, 300, (set) => {
      // 외곽 사각형 + 문 갭 1개 (상단 벽 중앙 60px 갭)
      thickLine(set, 30, 30, 150, 30, 8)
      thickLine(set, 210, 30, 370, 30, 8)
      thickLine(set, 30, 270, 370, 270, 8)
      thickLine(set, 30, 30, 30, 270, 8)
      thickLine(set, 370, 30, 370, 270, 8)
      // 내벽 1개
      thickLine(set, 200, 38, 200, 270, 8)
    })
    const plan = buildPlanFromImage(g, {
      threshold: 128,
      minThicknessPx: 4,
      minLengthPx: 40,
      gapRangeMm: [500, 1600],
      exteriorWallMm: 200,
      minRoomAreaM2: 1,
      wallHeightMm: 2400,
    })
    expect(plan.walls.length).toBeGreaterThanOrEqual(5)
    expect(plan.rooms.length).toBeGreaterThanOrEqual(2)
    expect(plan.openings.length).toBeGreaterThanOrEqual(1)
    // 벽 좌표는 mm 스케일 (외벽 두께 200px→8px ⇒ 25mm/px, 400px → ~10000mm)
    expect(Math.max(...plan.walls.map((w) => Math.max(w.a.x, w.b.x)))).toBeGreaterThan(8000)
  })
})
