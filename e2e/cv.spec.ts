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
    g.beginPath()
    g.moveTo(30, 8)
    g.lineTo(770, 8)
    g.stroke()
    g.beginPath()
    g.moveTo(8, 30)
    g.lineTo(8, 530)
    g.stroke()
    return c.toDataURL('image/png')
  })
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
}

async function makeSemanticMask(
  page: import('@playwright/test').Page,
  kind: 'wall' | 'door' | 'window'
): Promise<string> {
  return page.evaluate((maskKind) => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 560
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#fff'
    if (maskKind === 'wall') {
      ctx.lineWidth = 10
      const line = (x1: number, y1: number, x2: number, y2: number) => {
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
      line(30, 30, 340, 30)
      line(395, 30, 770, 30)
      line(30, 530, 770, 530)
      line(30, 30, 30, 530)
      line(770, 30, 770, 530)
      line(400, 35, 400, 530)
    } else if (maskKind === 'door') {
      ctx.fillRect(345, 25, 46, 11)
    } else {
      ctx.fillRect(500, 525, 81, 11)
    }
    return canvas.toDataURL('image/png')
  }, kind)
}

test('평면도 업로드는 축척 확인 후 2D 보정 또는 3D 보기를 선택하게 한다', async ({ page }) => {
  const uploadCta = page.getByRole('button', { name: /평면도 업로드.*3D/ })
  await expect(uploadCta).toBeVisible()
  await uploadCta.click()

  const modal = page.locator('.modal')
  await expect(modal.getByText('1. 도면 업로드')).toBeVisible()
  await modal.locator('input[type=file]').setInputFiles({
    name: 'plan.png',
    mimeType: 'image/png',
    buffer: await makePlanPng(page),
  })
  await expect(modal.locator('.status')).toContainText(/벽 \d+개 · 방 \d+개/, { timeout: 10_000 })

  const applyButton = modal.getByRole('button', { name: /변환 결과 적용/ })
  await expect(modal.locator('.pv-scale-state')).toContainText(/실측 가로.*입력|추정 축척.*확인/)
  await expect(applyButton).toBeDisabled()

  await modal.getByLabel('도면 전체 가로 실측').fill('12000')
  await expect(modal.locator('.pv-scale-state')).toContainText(/12,000mm.*보정/, {
    timeout: 10_000,
  })
  await expect(applyButton).toBeEnabled()
  await applyButton.click()

  await expect(modal.getByRole('heading', { name: /변환 적용 완료/ })).toBeVisible()
  await expect(modal.getByRole('button', { name: /2D에서 보정/ })).toBeVisible()
  await modal.getByRole('button', { name: /바로 3D 보기/ }).click()
  await expect(page.locator('.viewport canvas')).toBeVisible()
  expect(await page.evaluate(() => window.__hp3d_store.getState().mode)).toBe('3d')
})

test('추정 축척은 원본과 4개 항목을 2D에서 검수한 뒤에만 3D를 연다', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.getByRole('button', { name: /평면도 업로드.*3D/ }).click()
  const modal = page.locator('.modal')
  await modal.locator('input[type=file]').setInputFiles({
    name: 'estimated-plan.png',
    mimeType: 'image/png',
    buffer: await makePlanPng(page),
  })
  await expect(modal.locator('.status')).toContainText(/벽 \d+개 · 방 \d+개/, {
    timeout: 10_000,
  })
  await modal.getByLabel(/실측값 없이 추정 축척/).check()
  await modal.getByRole('button', { name: /변환 결과 적용/ }).click()

  const direct3d = modal.getByRole('button', { name: /바로 3D 보기/ })
  await expect(direct3d).toBeDisabled()
  await modal.getByRole('button', { name: /2D에서.*검수/ }).click()

  const source = page.getByTestId('floorplan-review-source')
  await expect(source).toBeVisible()
  await expect(page.getByRole('button', { name: '3D 배치' })).toBeDisabled()
  await page.keyboard.press('3')
  await expect(page.locator('.toast')).toContainText('2D 검수')
  expect(await page.evaluate(() => window.__hp3d_store.getState().mode)).toBe('2d')

  const review = page.getByRole('complementary', { name: '변환 초안 검수', exact: true })
  const complete = review.getByRole('button', { name: /검수 완료하고 3D 보기/ })
  await expect(complete).toBeDisabled()
  const checks = review.getByRole('checkbox')
  await expect(checks).toHaveCount(4)
  for (let index = 0; index < 4; index++) await checks.nth(index).check()
  await expect(complete).toBeEnabled()
  await complete.click()

  await expect(page.locator('.viewport canvas')).toBeVisible()
  expect(await page.evaluate(() => window.__hp3d_store.getState().mode)).toBe('3d')

  await page.waitForTimeout(900)
  await page.reload()
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  expect(await page.evaluate(() => window.__hp3d_store.getState().floorPlanReview?.status)).toBe(
    'completed'
  )
})

test('CV 엔진이 도면 이미지에서 벽·방·문을 자동 검출해 3D 평면도로 변환한다', async ({ page }) => {
  await page.getByRole('button', { name: /평면도 업로드.*3D/ }).click()
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
  expect(status).toMatch(/문 [1-9]\d*개/)

  // 도면에 표기된 전체 가로 실측값으로 축척 보정
  await modal.getByLabel('도면 전체 가로 실측').fill('12000')
  await expect(modal.locator('.status')).toContainText('축척', { timeout: 10_000 })

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
  await modal.getByRole('button', { name: /변환 결과 적용/ }).click()
  await modal.getByRole('button', { name: /2D에서 보정/ }).click()
  await expect(page.locator('.ed2d-svg')).toBeVisible({ timeout: 10_000 })
  const reviewGuide = page.getByRole('complementary', { name: '변환 초안 검수', exact: true })
  await expect(reviewGuide).toBeVisible()
  await expect(reviewGuide).toContainText('벽 연결')
  await expect(reviewGuide).toContainText('방 경계')
  await expect(reviewGuide).toContainText('문·창문')
  await expect(reviewGuide).toContainText('실측 치수')
  const plan = await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    return {
      walls: s.plan.walls.length,
      rooms: s.plan.rooms.length,
      openings: s.plan.openings.length,
      minX: Math.min(...s.plan.walls.flatMap((w: any) => [w.a.x, w.b.x])),
      maxX: Math.max(...s.plan.walls.flatMap((w: any) => [w.a.x, w.b.x])),
    }
  })
  expect(plan.walls).toBeGreaterThanOrEqual(4)
  expect(plan.rooms).toBeGreaterThanOrEqual(1)
  expect(plan.openings).toBeGreaterThanOrEqual(1)
  expect(plan.maxX - plan.minX).toBeCloseTo(12000, -1)
})

test('실도면의 큰 축척 보정 뒤에도 검출한 문을 적용 결과에 보존한다', async ({ page }) => {
  await page.getByRole('button', { name: /평면도 업로드.*3D/ }).click()
  const modal = page.locator('.modal')
  await modal.locator('input[type=file]').setInputFiles('e2e/fixtures/real-korean-33pyeong.png')
  await expect(modal.locator('.status')).toContainText(/문 [1-9]\d*개/, { timeout: 10_000 })
  await modal.getByLabel('도면 전체 가로 실측').fill('11800')
  await expect(modal.locator('.status')).toContainText(/문 [1-9]\d*개/, { timeout: 10_000 })
  await modal.getByRole('button', { name: /변환 결과 적용/ }).click()
  await expect(modal.getByText(/문·창문 [1-9]\d*개/)).toBeVisible()
  await modal.getByRole('button', { name: /2D에서 보정/ }).click()
  expect(
    await page.evaluate(() => window.__hp3d_store.getState().plan.openings.length)
  ).toBeGreaterThan(0)
})

test('어두운 배경 색상 도면은 밝은 벽선만 분리해 방을 복구한다', async ({ page }) => {
  await page.getByRole('button', { name: /평면도 업로드.*3D/ }).click()
  const modal = page.locator('.modal')
  await modal.locator('input[type=file]').setInputFiles('e2e/fixtures/real-wikimedia-apartment.png')
  await expect(modal.locator('.status')).toContainText(/어두운 배경 자동 반전.*방 [1-9]\d*개/, {
    timeout: 10_000,
  })
  await expect(modal.locator('.status')).toContainText(/문 [1-9]\d*개/)
})

test('해칭으로 벽선이 과밀하고 방 커버리지가 낮은 2방 결과는 적용을 막는다', async ({ page }) => {
  await page.getByRole('button', { name: /평면도 업로드.*3D/ }).click()
  const modal = page.locator('.modal')
  await modal
    .locator('input[type=file]')
    .setInputFiles('e2e/fixtures/real-wikimedia-space-apartment.png')
  await expect(modal.locator('.status')).toContainText(/방 0개/, { timeout: 10_000 })

  await modal.getByText('고급 검출 설정').click()
  await modal.getByLabel('자동 임계값(Otsu)').uncheck()
  await modal.getByRole('slider', { name: /이진화 임계값/ }).fill('180')
  await modal.getByRole('slider', { name: /최소 벽 두께/ }).fill('6')
  await modal.getByLabel('도면 전체 가로 실측').fill('10000')

  await expect(modal.locator('.status')).toContainText(/벽 50개 · 방 2개/, {
    timeout: 10_000,
  })
  const reviewResult = modal.locator('.pv-review-result')
  expect(Number(await reviewResult.getAttribute('data-room-coverage'))).toBeLessThan(0.3)
  expect(Number(await reviewResult.getAttribute('data-wall-density'))).toBeGreaterThan(9)
  await expect(reviewResult).toContainText(/방 경계.*벽선.*과밀/)
  await expect(modal.getByRole('button', { name: /변환 결과 적용/ })).toBeDisabled()
})

test('복수 평면 입력은 적용을 막고 단일 도면 재업로드 시 차단을 해제한다', async ({ page }) => {
  await page.getByRole('button', { name: /평면도 업로드.*3D/ }).click()
  const modal = page.locator('.modal')
  const fileInput = modal.locator('input[type=file]')
  const applyButton = modal.getByRole('button', { name: /변환 결과 적용/ })

  await fileInput.setInputFiles('e2e/fixtures/real-wikimedia-somerville.png')
  await expect(modal.getByRole('alert')).toContainText(
    /여러 평면도 영역.*한 번에 한 층 또는 한 세대/,
    { timeout: 20_000 }
  )
  await expect(modal.locator('.status')).toContainText(/여러 평면도 영역 \d+개 감지/, {
    timeout: 20_000,
  })
  await expect(applyButton).toBeDisabled()

  await fileInput.setInputFiles('e2e/fixtures/real-korean-33pyeong.png')
  await expect(modal.getByRole('alert')).toHaveCount(0)
  await expect(modal.locator('.status')).toContainText(/벽 \d+개 · 방 \d+개/, { timeout: 10_000 })
  await modal.getByLabel('도면 전체 가로 실측').fill('11800')
  await expect(applyButton).toBeEnabled()
})

test('로컬 CNN door/window 채널을 직접 Opening으로 변환한다', async ({ page }) => {
  const [wallMask, doorMask, windowMask] = await Promise.all([
    makeSemanticMask(page, 'wall'),
    makeSemanticMask(page, 'door'),
    makeSemanticMask(page, 'window'),
  ])
  await page.route('http://127.0.0.1:8976/health', (route) =>
    route.fulfill({ json: { ok: true, device: 'cuda', cudaAvailable: true } })
  )
  await page.route('http://127.0.0.1:8976/segment', (route) =>
    route.fulfill({
      json: {
        maskDataUrl: wallMask,
        doorMaskDataUrl: doorMask,
        windowMaskDataUrl: windowMask,
        width: 800,
        height: 560,
        device: 'cuda',
        inferenceMs: 42,
      },
    })
  )

  await page.getByRole('button', { name: /평면도 업로드.*3D/ }).click()
  const modal = page.locator('.modal')
  await modal.locator('input[type=file]').setInputFiles({
    name: 'plan.png',
    mimeType: 'image/png',
    buffer: await makePlanPng(page),
  })
  await expect(modal.locator('.status')).toContainText(/CNN\(cuda, 42ms\).*문 1개 · 창 1개/, {
    timeout: 10_000,
  })
  await modal.getByText('고급 검출 설정').click()
  await expect(modal.getByLabel(/로컬 CNN 벽 분할/)).toBeChecked()
  await modal.getByLabel('도면 전체 가로 실측').fill('12000')
  await modal.getByRole('button', { name: /변환 결과 적용/ }).click()
  await modal.getByRole('button', { name: /2D에서 보정/ }).click()
  await expect(page.locator('.ed2d-svg')).toBeVisible({ timeout: 10_000 })
  const openingTypes = await page.evaluate(() =>
    window.__hp3d_store.getState().plan.openings.map((opening: any) => opening.type)
  )
  expect(openingTypes.filter((type: string) => type === 'door')).toHaveLength(1)
  expect(openingTypes.filter((type: string) => type === 'window')).toHaveLength(1)
})
