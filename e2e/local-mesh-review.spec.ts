import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const localRecord = path.resolve(
  process.env.VITE_LOCAL_MESH_REVIEW_RECORD ??
    'artifacts/generated-mesh/quarantine/ik-kivik-3seat/mesh-ik-kivik-3seat-1787900563519/record.json'
)

test('개발 전용 KIVIK 로컬 검수 메시를 실제 방에 배치하고 회전한다', async ({ page }) => {
  test.skip(!existsSync(localRecord), '로컬 quarantine fixture가 없는 환경')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store && !!(window as any).__hp3d_scene)
  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', { hasText: /KIVIK 쉬비크 3인용소파/ })
  await expect(card.getByText('로컬 생성 3D · 자동 게이트 실패')).toBeVisible()
  await expect(card.locator('[data-visual-capability="local-review-mesh"]')).toBeVisible()
  const reportLink = card.getByRole('link', { name: /검수/ })
  await expect(reportLink).toHaveAttribute('href', /__local-mesh-review__.*review\.html/)

  const glbResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/__local-mesh-review__/') && response.url().endsWith('/mesh.glb')
  )
  const placementId = await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    return window.__hp3d_store.getState().addPlacement('ik-kivik-3seat', { x: 5600, z: 3600 })
  })
  expect((await glbResponse).status()).toBe(200)
  await page.waitForFunction(() => {
    let found = false
    ;(window as any).__hp3d_scene.traverse((object: any) => {
      if (object.userData?.localReview === true) found = true
    })
    return found
  })
  await expect(card.getByText('로컬 생성 3D · 자동 게이트 실패')).toBeVisible()
  await expect(card.locator('[data-render-source="local-review-mesh"]')).toBeVisible()

  const before = await page.evaluate((id) => {
    const state = window.__hp3d_store.getState()
    state.select(id)
    return state.placements.find((placement) => placement.id === id)?.rotY
  }, placementId)
  await page.keyboard.press('r')
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          window.__hp3d_store.getState().placements.find((placement) => placement.id === id)?.rotY,
        placementId
      )
    )
    .toBe((before ?? 0) + 15)
  expect(
    await page.evaluate(() => window.__hp3d_store.getState().productById('ik-kivik-3seat').dims)
  ).toEqual({ w: 2280, d: 950, h: 830 })
  expect(await page.evaluate(() => (window as any).__hp3d_gl.getContext().isContextLost())).toBe(
    false
  )
  expect(errors).toEqual([])
})
