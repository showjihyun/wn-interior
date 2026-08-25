// 프로덕션 빌드 스모크 — 로드/렌더/배치/2D 전환만 빠르게
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('프로덕션 빌드: 앱 로드 + 3D 캔버스 + 스토어 초기화', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await expect(page.locator('.viewport canvas')).toBeVisible()
  const n = await page.evaluate(() => window.__hp3d_store.getState().placements.length)
  expect(n).toBeGreaterThan(0)
})

test('프로덕션 빌드: 제품 배치 → 선택 → 2D 전환', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /거실/ }).click()
  await page.getByText('3인용 패브릭 소파').first().click()
  const canvas = page.locator('.viewport canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.6)
  await page.waitForTimeout(250)
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.6)
  expect(await page.evaluate(() => window.__hp3d_store.getState().placements.at(-1)?.productId)).toBe('p-sofa3')
  await page.getByRole('button', { name: '2D 도면편집' }).click()
  await expect(page.locator('.ed2d-svg')).toBeVisible()
  expect(errors).toEqual([])
})
