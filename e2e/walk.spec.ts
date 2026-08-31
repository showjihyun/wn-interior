// M16 워크스루 캐릭터 E2E
import { test, expect } from '@playwright/test'

const S = async (page: import('@playwright/test').Page, expr: string) =>
  page.evaluate(`(window.__hp3d_store.getState())${expr}`)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
})

test('워크스루 진입 → 설정 패널 표시 → 신장/몸무게 반영', async ({ page }) => {
  await page.getByRole('button', { name: /워크스루/ }).click()
  expect(await S(page, '.viewPreset')).toBe('walk')
  await expect(page.locator('.walk-panel')).toBeVisible()
  expect(await S(page, '.walkConfig')).toEqual({ heightCm: 170, weightKg: 65 })

  await page.locator('.walk-panel label').nth(0).locator('input').fill('180')
  expect(await S(page, '.walkConfig.heightCm')).toBe(180)
  await page.locator('.walk-panel label').nth(1).locator('input').fill('90')
  expect(await S(page, '.walkConfig.weightKg')).toBe(90)
  await page.waitForFunction(() => (window as any).__hp3d_walk?.radius === 146)
  // 반경 자동 산정: 110 + (90-60)*1.2 = 146
  expect(await page.evaluate(() => (window as any).__hp3d_walk.radius)).toBe(146)
})

test('WASD 이동이 실제 좌표를 바꾼다', async ({ page }) => {
  await page.getByRole('button', { name: /워크스루/ }).click()
  await page.waitForFunction(() => Number.isFinite((window as any).__hp3d_walk?.z))
  const before = await page.evaluate(() => ({ ...(window as any).__hp3d_walk }))
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(700)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(200)
  const after = await page.evaluate(() => ({ ...(window as any).__hp3d_walk }))
  expect(after.z).toBeLessThan(before.z) // 북쪽(-z) 진행
})

test('배치 가구와 충돌하면 통과하지 못한다', async ({ page }) => {
  // 스폰 정면(북쪽)에 소파 배치
  await page.evaluate(async () => {
    const s = window.__hp3d_store.getState()
    s.commit((d) => {
      d.placements = []
    })
    const walk = (window as any).__hp3d_walk
    void walk
  })
  await page.getByRole('button', { name: /워크스루/ }).click()
  await page.waitForFunction(
    () =>
      Number.isFinite((window as any).__hp3d_walk?.x) &&
      Number.isFinite((window as any).__hp3d_walk?.z)
  )
  // 스폰 좌표 확인 후 정면 북쪽 1m 지점에 의자 배치
  const spawn = await page.evaluate(() => ({ ...(window as any).__hp3d_walk }))
  await page.evaluate(({ x, z }) => {
    window.__hp3d_store.getState().addPlacement('p-chair', { x, z: z - 1000 })
  }, spawn)
  await page.waitForFunction(() => {
    const placement = window.__hp3d_store
      .getState()
      .placements.find((candidate) => candidate.productId === 'p-chair')
    return Number.isFinite(placement?.pos.x) && Number.isFinite(placement?.pos.z)
  })

  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(200)
  const final = await page.evaluate(() => ({ ...(window as any).__hp3d_walk }))
  const sofa = await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    const p = s.placements.find((x: any) => x.productId === 'p-chair')
    return { cz: p.pos.z, d: s.productById(p.productId).dims.d }
  })
  // 소파 중심을 뚫지 못함: 캐릭터 z는 소파 남단 + 반경 이상
  expect(final.z).toBeGreaterThan(sofa.cz + sofa.d / 2 - 10)
})

test('3인칭 전환 시 캐릭터가 렌더된다 (픽셀 검사)', async ({ page }) => {
  await page.getByRole('button', { name: /워크스루/ }).click()
  await page.waitForFunction(() => Number.isFinite((window as any).__hp3d_walk?.z))
  await page.locator('.walk-panel .wp-views').getByRole('button', { name: '3인칭' }).click()
  expect(await S(page, '.walkView')).toBe('tp')
  await page.waitForTimeout(500)
  const hasBody = await page.evaluate(() => {
    const renderer = (window as any).__hp3d_gl
    const glc = renderer.getContext()
    const w = renderer.domElement.width
    const h = renderer.domElement.height
    const px = new Uint8Array(w * h * 4)
    glc.readPixels(0, 0, w, h, glc.RGBA, glc.UNSIGNED_BYTE, px)
    // 캐릭터 몸통 색(#4a5568 근처) 탐색
    for (let i = 0; i < px.length; i += 4) {
      if (
        Math.abs(px[i] - 74) < 25 &&
        Math.abs(px[i + 1] - 85) < 25 &&
        Math.abs(px[i + 2] - 104) < 25
      )
        return true
    }
    return false
  })
  expect(hasBody).toBe(true)
})
