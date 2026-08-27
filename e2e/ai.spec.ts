// AI 도면 해석 실측 E2E — OpenRouter 실제 API 호출 (네트워크 필요)
// ⚠️ 키는 저장하지 않음 — 실행 전 환경변수로 지정하세요:
//   PowerShell: $env:OPENROUTER_API_KEY="sk-or-v1-..." ; npx playwright test e2e/ai.spec.ts
// 키 미지정 시 이 파일은 skip 됩니다.
import { test, expect } from '@playwright/test'
import { DEFAULT_AI_MODEL } from '../src/ai/client'

const API_KEY = process.env.OPENROUTER_API_KEY ?? ''
test.describe.configure({ mode: 'serial' })
test.skip(!API_KEY, 'OPENROUTER_API_KEY 환경변수 미지정 — 실제 API 테스트 생략')

async function makePlanPng(page: import('@playwright/test').Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 800
    c.height = 560
    const g = c.getContext('2d')!
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 800, 560)
    g.strokeStyle = '#111'
    g.lineWidth = 6
    g.strokeRect(40, 40, 728, 518)
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(362, 40)
    g.lineTo(362, 362)
    g.stroke()
    g.beginPath()
    g.moveTo(40, 362)
    g.lineTo(362, 362)
    g.stroke()
    g.beginPath()
    g.moveTo(362, 240)
    g.lineTo(504, 240)
    g.stroke()
    g.beginPath()
    g.moveTo(504, 40)
    g.lineTo(504, 240)
    g.stroke()
    g.fillStyle = '#111'
    g.font = '22px sans-serif'
    g.fillText('10400', 340, 30)
    g.fillText('7400', 8, 300)
    g.fillText('4600', 180, 385)
    g.fillText('4600', 330, 385)
    g.fillText('욕실', 420, 150)
    g.fillText('안방', 180, 200)
    g.fillText('거실', 600, 400)
    return c.toDataURL('image/png')
  })
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
}

async function openModalWithPlan(page: import('@playwright/test').Page, model: string) {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await page.evaluate(
    ({ key, m }) => {
      window.__hp3d_store.getState().setAi({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: key,
        model: m,
      })
    },
    { key: API_KEY, m: model }
  )
  await page.getByRole('button', { name: /AI 도면 해석/ }).click()
  const png = await makePlanPng(page)
  await page.locator('.modal input[type=file]').setInputFiles({
    name: 'plan.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(page.locator('.modal img')).toBeVisible()
  await page.locator('.modal').getByRole('button', { name: '해석 시작' }).click()
  await expect(page.locator('.status')).toContainText(/완료|실패/, { timeout: 150_000 })
  return await page.locator('.status').textContent()
}

test('OpenRouter 통신 스모크: 키 인증 + 오류 처리 (402/429도 유효 응답)', async ({ page }) => {
  const status = await openModalWithPlan(page, 'openai/gpt-4o')
  // 402(크레딧)/429(한도)/200(성공) 모두 "정상 통신" — 앱이 상황을 정확히 표시하는지
  expect(status).toMatch(/완료|402|429/)
})

test('무료 vision 모델로 도면 해석 전체 플로우 (한도 소진 시 skip)', async ({ page }) => {
  const status = await openModalWithPlan(page, DEFAULT_AI_MODEL)
  if (/429|402/.test(status ?? '')) {
    // 무료 티어 한도/크레딧 소진 — 로직 검증은 단위·스모크가 커버, 해석은 한도 회복 후 재실행
    test.skip(true, `한도/크레딧 상태(${status?.trim()}) — 회복 후 재실행`)
    return
  }
  expect(status).toContain('완료')
  await expect(page.locator('.ed2d-svg')).toBeVisible({ timeout: 10_000 })
  const walls = await page.evaluate(() => window.__hp3d_store.getState().plan.walls.length)
  expect(walls).toBeGreaterThan(0)
  const rooms = await page.evaluate(() => window.__hp3d_store.getState().plan.rooms.length)
  expect(rooms).toBeGreaterThan(0)
})
