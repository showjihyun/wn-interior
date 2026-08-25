// M15 CV 도면 변환 E2E — LLM/네트워크 없이 결정론 검증
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
})

// 합성 도면 PNG: 두꺼운 벽(10px) + 얇은 치수선(2px, 필터 대상) + 문 갭 1개
async function makePlanPng(page: import('@playwright/test').Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 800
    c.height = 560
    const g = c.getContext('2d')!
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 800, 560)
    g.strokeStyle = '#111'
    g.lineCap = 'butt'
    // 외곽 벽 (두께 10px) — 상단 벽 중앙에 80px 문 갭
    const wall = (x1: number, y1: number, x2: number, y2: number) => {
      g.beginPath()
      g.moveTo(x1, y1)
      g.lineTo(x2, y2)
      g.lineWidth = 10
      g.stroke()
    }
    wall(30, 30, 340, 30)
    wall(395, 30, 770, 30) // 갭: 341~394 (55px = 1100mm @20mm/px)
    wall(30, 530, 770, 530)
    wall(30, 30, 30, 530)
    wall(770, 30, 770, 530)
    // 내벽 1개
    wall(400, 35, 400, 530)
    // 얇은 치수선 (2px — 필터 대상)
    g.lineWidth = 2
    g.beginPath(); g.moveTo(30, 8); g.lineTo(770, 8); g.stroke()
    g.beginPath(); g.moveTo(8, 30); g.lineTo(8, 530); g.stroke()
    return c.toDataURL('image/png')
  })
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
}

test('CV 엔진이 도면 이미지에서 벽·방·문을 자동 검출해 3D 평면도로 변환한다', async ({ page }) => {
  await page.getByRole('button', { name: /도면 자동 변환/ }).click()
  const modal = page.locator('.modal')
  await expect(modal).toBeVisible()

  await modal.locator('input[type=file]').setInputFiles({
    name: 'plan.png',
    mimeType: 'image/png',
    buffer: await makePlanPng(page),
  })

  // 디바운스(250ms) 후 자동 실행 → 상태 텍스트에 검출 결과
  await expect(modal.locator('.status')).toContainText(/벽 \d+개 · 방 \d+개/, { timeout: 10_000 })
  const status = await modal.locator('.status').textContent()
  expect(status).toMatch(/벽 [4-9]개/) // 외곽 4 + 내벽 1 (얇은 치수선은 제외되어야 소수)
  expect(status).toMatch(/방 [1-9]개/)
  expect(status).toMatch(/문 후보 [1-9]개/)

  // 프리뷰 캔버스에 오버레이 렌더 확인 (벽 빨강 픽셀 존재)
  const hasRed = await page.evaluate(() => {
    const cv = document.querySelector('.pv-preview canvas') as HTMLCanvasElement
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 180 && d[i + 1] < 100 && d[i + 2] < 100) return true
    }
    return false
  })
  expect(hasRed).toBe(true)

  // 변환 적용 → 2D 편집기 + 벽/방 생성
  await modal.getByRole('button', { name: /3D 평면도로 변환 적용/ }).click()
  await expect(page.locator('.ed2d-svg')).toBeVisible({ timeout: 10_000 })
  const plan = await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    return { walls: s.plan.walls.length, rooms: s.plan.rooms.length, openings: s.plan.openings.length }
  })
  expect(plan.walls).toBeGreaterThanOrEqual(4)
  expect(plan.rooms).toBeGreaterThanOrEqual(1)
  expect(plan.openings).toBeGreaterThanOrEqual(1)
})
