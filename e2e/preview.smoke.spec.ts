// 프로덕션 빌드 스모크 — 로드/렌더/배치/2D 전환만 빠르게
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('프로덕션 빌드: 앱 로드 + 3D 캔버스 + 스토어 초기화', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await expect(page.locator('.viewport canvas')).toBeVisible()
  const n = await page.evaluate(() => window.__hp3d_store.getState().placements.length)
  expect(n).toBeGreaterThan(0)

  // 기존 3D 출력의 특성화 검사: canvas 존재가 아니라 실제 WebGL 픽셀 다양성을 확인한다.
  await page.waitForFunction(() => !!(window as any).__hp3d_gl)
  await page.waitForTimeout(500)
  const pixels = await page.evaluate(() => {
    const renderer = (window as any).__hp3d_gl
    const gl = renderer.getContext()
    const width = renderer.domElement.width
    const height = renderer.domElement.height
    const rgba = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba)

    let opaque = 0
    const quantizedColors = new Set<number>()
    for (let index = 0; index < rgba.length; index += 16) {
      if (rgba[index + 3] > 0) opaque++
      quantizedColors.add(
        ((rgba[index] >> 4) << 8) | ((rgba[index + 1] >> 4) << 4) | (rgba[index + 2] >> 4)
      )
    }
    return { opaque, samples: rgba.length / 16, colors: quantizedColors.size }
  })
  expect(pixels.opaque).toBeGreaterThan(pixels.samples * 0.5)
  expect(pixels.colors).toBeGreaterThan(8)
  expect(errors).toEqual([])
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
  expect(
    await page.evaluate(() => window.__hp3d_store.getState().placements.at(-1)?.productId)
  ).toBe('p-sofa3')
  await page.getByRole('button', { name: '2D 도면편집' }).click()
  await expect(page.locator('.ed2d-svg')).toBeVisible()
  expect(errors).toEqual([])
})

test('프로덕션 빌드: 비상업 도면 모델은 기본 비활성 상태를 명확히 알린다', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await page.getByRole('button', { name: /평면도 업로드.*3D/ }).click()
  const modal = page.locator('.modal')
  await expect(modal.getByText(/상업 배포 안전 모드/)).toBeVisible()
  await expect(modal.getByText(/비상업 CNN.*비활성/)).toBeVisible()
})
