// 계약 테스트 — CV 전처리 (노이즈 제거 / Otsu / 모폴로지 클로징 / 직교 스냅)
import { describe, it, expect } from 'vitest'
import {
  removeSmallComponents,
  autoThresholdOtsu,
  morphClose,
  orthogonalizePolygon,
  rescalePlanToWidth,
  toGray,
  type Gray,
} from './planVision'

function makeGray(w: number, h: number, draw: (set: (x: number, y: number) => void) => void): Gray {
  const data = new Uint8Array(w * h)
  draw((x, y) => {
    if (x >= 0 && y >= 0 && x < w && y < h) data[y * w + x] = 255
  })
  return { data, width: w, height: h }
}
const countInk = (g: Gray) => g.data.reduce((a, b) => a + (b > 0 ? 1 : 0), 0)

describe('removeSmallComponents (텍스트/기호 노이즈 제거)', () => {
  it('작은 덩어리(텍스트·가구기호)는 제거되고 큰 벽은 유지된다', () => {
    const g = makeGray(300, 100, (set) => {
      // 큰 벽 (두께 8, 길이 200 = 1600px)
      for (let x = 20; x < 220; x++) for (let y = 40; y < 48; y++) set(x, y)
      // 텍스트 블록 1 (5x7 = 35px)
      for (let x = 250; x < 255; x++) for (let y = 30; y < 37; y++) set(x, y)
      // 가구 기호 (12x12 = 144px)
      for (let x = 250; x < 262; x++) for (let y = 60; y < 72; y++) set(x, y)
    })
    const out = removeSmallComponents(g, 300)
    expect(countInk(out)).toBe(8 * 200) // 벽만 남음
  })
  it('minSize 0이면 아무것도 제거하지 않는다', () => {
    const g = makeGray(50, 50, (set) => set(10, 10))
    expect(countInk(removeSmallComponents(g, 0))).toBe(1)
  })
})

describe('autoThresholdOtsu (자동 임계값)', () => {
  it('이봉 히스토그램에서 두 모드 사이를 선택한다', () => {
    const rgba = new Uint8ClampedArray(4 * 200)
    for (let i = 0; i < 100; i++) {
      rgba[i * 4] = 30
      rgba[i * 4 + 1] = 30
      rgba[i * 4 + 2] = 30 // 어두움
      rgba[i * 4 + 3] = 255
    }
    for (let i = 100; i < 200; i++) {
      rgba[i * 4] = 220
      rgba[i * 4 + 1] = 220
      rgba[i * 4 + 2] = 220 // 밝음
      rgba[i * 4 + 3] = 255
    }
    const t = autoThresholdOtsu(rgba, 200, 1)
    const gray = toGray(rgba, 200, 1, t)
    expect(t).toBeGreaterThanOrEqual(30)
    expect(t).toBeLessThan(220)
    expect(gray.data.slice(0, 100).every((pixel) => pixel === 255)).toBe(true)
    expect(gray.data.slice(100).every((pixel) => pixel === 0)).toBe(true)
  })
})

describe('morphClose (작은 갭 봉합)', () => {
  it('벽의 2px 균열이 봉합된다', () => {
    const g = makeGray(100, 20, (set) => {
      for (let x = 10; x < 48; x++) for (let y = 8; y < 14; y++) set(x, y)
      for (let x = 51; x < 90; x++) for (let y = 8; y < 14; y++) set(x, y)
      // 48~50 (3px 균열)
    })
    const closed = morphClose(g, 2)
    // 균열 지점 (49, 10)이 잉크로 채워짐
    expect(closed.data[10 * 100 + 49]).toBe(255)
  })
  it('큰 갭(문)은 유지된다', () => {
    const g = makeGray(100, 20, (set) => {
      for (let x = 10; x < 40; x++) for (let y = 8; y < 14; y++) set(x, y)
      for (let x = 60; x < 90; x++) for (let y = 8; y < 14; y++) set(x, y)
      // 20px 갭 (문)
    })
    const closed = morphClose(g, 2)
    expect(closed.data[10 * 100 + 50]).toBe(0)
  })
})

describe('orthogonalizePolygon (직교 스냅)', () => {
  it('3도 기운 사각형을 축 정렬로 보정한다', () => {
    // 약간 기운 사각형
    const poly = [
      { x: 1000, y: 1000 },
      { x: 5000, y: 1050 }, // +50 기울음
      { x: 4950, y: 5000 },
      { x: 1000, y: 5000 },
    ]
    const out = orthogonalizePolygon(poly, 60)
    // 모든 변이 축 정렬 (x 또는 y가 쌍으로 일치)
    const edges = out.map((p, i) => {
      const q = out[(i + 1) % out.length]
      return { dx: Math.abs(q.x - p.x), dy: Math.abs(q.y - p.y) }
    })
    for (const e of edges) expect(e.dx < 1 || e.dy < 1).toBe(true)
  })
})

describe('rescalePlanToWidth (실측 가로 치수 보정)', () => {
  it('좌표·두께·문 폭·방 면적·mmPerPx를 동일 비율로 보정한다', () => {
    const plan = {
      wallHeight: 2400,
      walls: [{ a: { x: 100, y: 200 }, b: { x: 4100, y: 200 }, thickness: 100 }],
      openings: [{ type: 'door' as const, at: { x: 1100, y: 200 }, width: 800 }],
      rooms: [
        {
          name: '방1',
          polygon: [
            { x: 100, y: 200 },
            { x: 4100, y: 200 },
            { x: 4100, y: 2200 },
            { x: 100, y: 2200 },
          ],
          areaM2: 8,
        },
      ],
      mmPerPx: 10,
    }

    const out = rescalePlanToWidth(plan, 8000)
    const xs = out.walls.flatMap((wall) => [wall.a.x, wall.b.x])
    expect(Math.max(...xs) - Math.min(...xs)).toBe(8000)
    expect(out.walls[0].thickness).toBe(200)
    expect(out.openings[0].width).toBe(1600)
    expect(out.rooms[0].areaM2).toBe(32)
    expect(out.mmPerPx).toBe(20)
    expect(plan.mmPerPx).toBe(10)
  })

  it('유효한 가로 치수나 벽이 없으면 원본을 유지한다', () => {
    const empty = { wallHeight: 2400, walls: [], openings: [], rooms: [], mmPerPx: 10 }
    expect(rescalePlanToWidth(empty, 8000)).toBe(empty)
    expect(rescalePlanToWidth(empty, 0)).toBe(empty)
  })
})
