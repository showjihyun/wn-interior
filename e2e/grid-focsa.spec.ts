// FOCSA 실도면 파라미터 그리드 탐색 — 최적 조합 도출
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import {
  buildPlanFromImage,
  autoBinarizeFloorPlan,
  removeSmallComponents,
  morphClose,
} from '../src/domain/engine/planVision'
import type { Gray } from '../src/domain/engine/planVision'

interface GridResult {
  summary: string
  walls: number
  rooms: number
  openings: number
  mmPerPx: number
}

test('FOCSA 파라미터 그리드에 유효한 기준선 조합이 존재한다', async ({ page }) => {
  const buf = readFileSync('e2e/fixtures/real-focsa-apt.jpg')
  const dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`
  await page.goto('about:blank')
  const rgbaArr = await page.evaluate(async (src) => {
    const im = new Image()
    im.src = src
    await im.decode()
    const c = document.createElement('canvas')
    c.width = im.naturalWidth
    c.height = im.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(im, 0, 0)
    const id = ctx.getImageData(0, 0, c.width, c.height)
    return { data: Array.from(id.data), width: c.width, height: c.height }
  }, dataUrl)

  const rgba = new Uint8ClampedArray(rgbaArr.data)
  const binarized = autoBinarizeFloorPlan(rgba, rgbaArr.width, rgbaArr.height)
  const th = binarized.threshold
  const base: Gray = binarized.gray

  const results: GridResult[] = []
  for (const denoise of [300, 800, 1200, 2000]) {
    for (const closeR of [2, 3]) {
      for (const minThick of [4, 6]) {
        const g1 = closeR > 0 ? morphClose(base, closeR) : base
        const g2 = removeSmallComponents(g1, denoise)
        const plan = buildPlanFromImage(g2, {
          threshold: th,
          minThicknessPx: minThick,
          minLengthPx: 40,
          gapRangeMm: [500, 1400],
          exteriorWallMm: 200,
          minRoomAreaM2: 1.5,
          wallHeightMm: 2400,
          orthoToleranceMm: 80,
        })
        const largest = plan.rooms.reduce((a, r) => Math.max(a, r.areaM2), 0)
        const total = plan.rooms.reduce((a, r) => a + r.areaM2, 0)
        results.push({
          summary: `dn=${denoise} cr=${closeR} mt=${minThick} → 벽${plan.walls.length} 방${plan.rooms.length} 문${plan.openings.length} 최대${Math.round(largest * 10) / 10}㎡ 합계${Math.round(total * 10) / 10}㎡ 축척${plan.mmPerPx.toFixed(1)}`,
          walls: plan.walls.length,
          rooms: plan.rooms.length,
          openings: plan.openings.length,
          mmPerPx: plan.mmPerPx,
        })
      }
    }
  }

  expect(results).toHaveLength(16)
  expect(results.every((result) => Number.isFinite(result.mmPerPx) && result.mmPerPx > 0)).toBe(
    true
  )
  expect(
    results.some((result) => result.walls >= 40 && result.rooms >= 5 && result.openings >= 15)
  ).toBe(true)

  console.log('GRID-START')
  for (const result of results) console.log('GRID ' + result.summary)
  console.log('GRID-END')
})
