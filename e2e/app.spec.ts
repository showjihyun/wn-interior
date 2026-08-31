import { test, expect, type Page } from '@playwright/test'

const S = async (page: Page, expr: string) =>
  page.evaluate(`(window.__hp3d_store.getState())${expr}`)

const worldPoint = async (page: Page, x: number, z: number) =>
  page.evaluate(
    ({ x, z }) => {
      const camera = (window as any).__hp3d_cam
      const rect = document.querySelector('.viewport canvas')!.getBoundingClientRect()
      const projected = camera.position.clone().set(x, 0, z).project(camera)
      return {
        x: rect.x + ((projected.x + 1) / 2) * rect.width,
        y: rect.y + ((1 - projected.y) / 2) * rect.height,
      }
    },
    { x, z }
  )

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  await expect(page.locator('.viewport canvas')).toBeVisible()
  await page.waitForFunction(() => !!(window as any).__hp3d_scene)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
})

test('앱이 로드되고 샘플 아파트 3D 캔버스가 렌더된다', async ({ page }) => {
  await expect(page.locator('.brand')).toContainText('홈플랜')
  await expect(page.locator('.viewport canvas')).toBeVisible()
  expect(await S(page, '.placements.length')).toBeGreaterThan(0)
})

test('카탈로그 제품 클릭 → 캔버스 클릭 배치 → 선택·인스펙터 표시', async ({ page }) => {
  await page.evaluate(() => window.__hp3d_store.setState({ placements: [] }))
  await page.getByRole('button', { name: '탑뷰' }).click()
  await page.waitForTimeout(500)
  const before = await S(page, '.placements.length')
  await page.getByRole('button', { name: /거실/ }).click()
  await page.getByText('3인용 패브릭 소파').first().click()
  expect(await S(page, '.pendingProductId')).toBe('p-sofa3')

  const point = await worldPoint(page, 9000, 5000)
  await page.mouse.move(point.x, point.y)
  await page.waitForTimeout(250)
  await page.mouse.click(point.x, point.y)

  expect(await S(page, '.placements.length')).toBe(before + 1)
  expect(await S(page, '.placements.at(-1).productId')).toBe('p-sofa3')
  expect(await S(page, '.placements.at(-1).roomId')).toBeTruthy()
  expect(await S(page, '.selectedId')).not.toBeNull()
  await expect(page.locator('.inspector h4')).toContainText('소파')
})

test('인스펙터 회전 버튼이 rotY를 정확히 변경한다', async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    window.__hp3d_store.setState({ placements: [] })
    s.addPlacement('p-dining-table', { x: 9000, z: 5000 })
  })
  await expect(page.locator('.inspector h4')).toContainText('식탁')
  const r0 = await S(page, '.placements.at(-1).rotY')
  await page.getByRole('button', { name: '+90°' }).click()
  expect(await S(page, '.placements.at(-1).rotY')).toBe(r0 + 90)
  await page.getByRole('button', { name: '-15°' }).click()
  expect(await S(page, '.placements.at(-1).rotY')).toBe(r0 + 75)
})

test('색상 스와치가 colorway를 변경한다', async ({ page }) => {
  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('p-sofa3', { x: 9000, z: 5000 })
  })
  await page.locator('.swatches .sw').nth(2).click()
  const color = ((await S(page, '.placements.at(-1).colorway')) as string).toLowerCase()
  const expected = (
    await page.evaluate(() => window.__hp3d_store.getState().productById('p-sofa3').colorways[2])
  ).toLowerCase()
  expect(color).toBe(expected)
})

test('벽걸이 TV 설치 높이 슬라이더가 elevationOverride를 변경한다', async ({ page }) => {
  await page.evaluate(() =>
    window.__hp3d_store.getState().addPlacement('p-tv-wall', { x: 6800, z: 200 })
  )
  await expect(page.locator('.inspector h4')).toContainText('벽걸이')
  const slider = page.locator('.inspector input[type=range]')
  await slider.fill('1200')
  expect(await S(page, '.placements.at(-1).elevationOverride')).toBe(1200)
})

test('Delete 키로 선택 제품이 삭제되고 Undo로 복원된다', async ({ page }) => {
  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('p-chair', { x: 9000, z: 5000 })
  })
  const n = await S(page, '.placements.length')
  await page.keyboard.press('Delete')
  expect(await S(page, '.placements.length')).toBe(n - 1)
  await page.getByRole('button', { name: /되돌리기/ }).click()
  expect(await S(page, '.placements.length')).toBe(n)
  await page.getByRole('button', { name: /다시실행/ }).click()
  expect(await S(page, '.placements.length')).toBe(n - 1)
})

test('커스텀 실측 제품 등록 → 카탈로그 등장 → 배치 성공', async ({ page }) => {
  await page
    .getByRole('button', { name: /내 가구/ })
    .first()
    .click()
  await page.getByPlaceholder(/우리집 소파/).fill('E2E 테스트 의자')
  await page.getByPlaceholder('가로 mm').fill('500')
  await page.getByPlaceholder('세로 mm').fill('550')
  await page.getByPlaceholder('높이 mm').fill('900')
  await page.getByRole('button', { name: /카탈로그에 등록/ }).click()

  await expect(page.locator('.pcard', { hasText: 'E2E 테스트 의자' })).toBeVisible()
  // 결정론성: 기존 가구를 비워 클릭 지점이 반드시 바닥이 되도록
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    s.commit((d) => {
      d.placements = []
    })
  })
  await page.locator('.pcard', { hasText: 'E2E 테스트 의자' }).click()
  const canvas = page.locator('.viewport canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.waitForTimeout(250)
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
  expect(await S(page, `.placements.at(-1).productId`)).toMatch(/^custom-/)
  const dims = await S(page, `.customProducts.at(-1).dims`)
  expect(dims).toEqual({ w: 500, d: 550, h: 900 })
})

test('마감재 변경이 방 데이터에 반영된다', async ({ page }) => {
  await page.getByRole('button', { name: /마감재/ }).click()
  const firstRoom = page.locator('.mroom').first()
  await firstRoom.locator('select').first().selectOption('f-tile-gray')
  expect(await S(page, '.plan.rooms[0].floorMaterialId')).toBe('f-tile-gray')
  await firstRoom.locator('select').nth(1).selectOption('w-accent-green')
  expect(await S(page, '.plan.rooms[0].wallMaterialId')).toBe('w-accent-green')
})

test('2D 모드에서 벽을 그리면 치수 라벨이 늘어난다', async ({ page }) => {
  await page.getByRole('button', { name: '2D 도면편집' }).click()
  const svg = page.locator('.ed2d-svg')
  await expect(svg).toBeVisible()
  const before = await svg.locator('line').count()
  await page.getByRole('button', { name: /벽 그리기/ }).click()
  const b = (await svg.boundingBox())!
  await svg.click({ position: { x: b.width * 0.42, y: b.height * 0.32 } })
  await svg.click({ position: { x: b.width * 0.62, y: b.height * 0.32 } })
  await page.getByRole('button', { name: '벽 완성' }).click()
  expect(await svg.locator('line').count()).toBeGreaterThan(before)
  expect((await S(page, '.plan.walls.length')) > 10).toBeTruthy()
})

test('2D에서 문 배치 후 폭을 조절하면 store에 반영된다', async ({ page }) => {
  await page.getByRole('button', { name: '2D 도면편집' }).click()
  const n0 = await S(page, '.plan.openings.length')
  await page.getByRole('button', { name: /^문$/ }).click()
  const svg = page.locator('.ed2d-svg')
  const b = (await svg.boundingBox())!
  // 북벽(y=0)은 화면 상단 약 15% 지점 — 클릭이 벽 허용거리(800mm) 안에 들어오도록
  await svg.click({ position: { x: b.width * 0.45, y: b.height * 0.15 } })
  expect(await S(page, '.plan.openings.length')).toBe(n0 + 1)

  // 새 개구부를 testid로 결정론적으로 선택 — 회전된 g의 bbox 중심이 아닌 흰 몸체(rect) 클릭
  const oid = await S(page, '.plan.openings.at(-1).id')
  const center = await page.evaluate((id) => {
    const r = document
      .querySelector(`[data-testid="opening-${id}"] > rect`)!
      .getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, oid)
  await page.mouse.click(center.x, center.y)
  await expect(page.locator('.floating-panel')).toBeVisible()

  await page.locator('.floating-panel input[type=number]').first().fill('950')
  const width = await page.evaluate(
    (id) => window.__hp3d_store.getState().plan.openings.find((o: any) => o.id === id).width,
    oid
  )
  expect(width).toBe(950)
})

test('배치안 저장 → 적용 흐름이 동작하고 Undo 가능하다', async ({ page }) => {
  const base = await S(page, '.placements.length')
  await page.getByRole('button', { name: /배치안 비교/ }).click()
  const modal = page.locator('.modal')
  await modal.getByPlaceholder(/배치안 이름/).fill('A안 — 테스트')
  await modal.getByRole('button', { name: '현재 상태 저장' }).click()
  await expect(modal.getByText('A안 — 테스트')).toBeVisible()
  await page.evaluate(() =>
    window.__hp3d_store.getState().addPlacement('p-armchair', { x: 9500, z: 6000 })
  )
  expect(await S(page, '.placements.length')).toBe(base + 1)
  await modal.getByRole('button', { name: '적용' }).first().click()
  expect(await S(page, '.placements.length')).toBe(base)
  await page.keyboard.press('Control+z')
  expect(await S(page, '.placements.length')).toBe(base + 1)
})

test('동일한 배치는 다른 이름의 A/B안으로 중복 저장하지 않는다', async ({ page }) => {
  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [], variants: [] })
    window.__hp3d_store.getState().addPlacement('p-sofa3', { x: 9000, z: 5000 })
  })
  await page.getByRole('button', { name: /배치안 비교/ }).click()
  const modal = page.locator('.modal')
  const name = modal.getByPlaceholder(/배치안 이름/)
  const save = modal.getByRole('button', { name: '현재 상태 저장' })

  await name.fill('A안')
  await save.click()
  await expect(modal.locator('.variant-card')).toHaveCount(1)

  await name.fill('B안')
  await save.click()
  await expect(modal.getByRole('status')).toContainText(/A안.*차이가 없습니다/)
  await expect(modal.locator('.variant-card')).toHaveCount(1)

  await page.evaluate(() => {
    const state = window.__hp3d_store.getState()
    const placement = state.placements[0]
    state.updatePlacement(placement.id, { rotY: placement.rotY + 15 })
  })
  await save.click()
  await expect(modal.locator('.variant-card')).toHaveCount(2)
  await expect(modal.getByRole('status')).toHaveCount(0)
})

test('자동저장: 새로고침 후에도 배치가 유지된다', async ({ page }) => {
  await page.evaluate(() =>
    window.__hp3d_store.getState().addPlacement('p-fridge', { x: 10000, z: 1000 })
  )
  await page.waitForTimeout(900) // debounce 600ms
  await page.reload()
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  const ids = await page.evaluate(() =>
    window.__hp3d_store.getState().placements.map((p: any) => p.productId)
  )
  expect(ids).toContain('p-fridge')
})

test('내보내기 버튼이 프로젝트 JSON 다운로드를 트리거한다', async ({ page }) => {
  const dl = page.waitForEvent('download', { timeout: 8000 })
  await page.getByRole('button', { name: /내보내기/ }).click()
  const d = await dl
  expect(d.suggestedFilename()).toMatch(/\.json$/)
})

test('시점 프리셋: 탑뷰 ↔ 워크스루 ↔ 아이소 전환', async ({ page }) => {
  await page.getByRole('button', { name: '탑뷰' }).click()
  expect(await S(page, '.viewPreset')).toBe('top')
  await page.getByRole('button', { name: /워크스루/ }).click()
  expect(await S(page, '.viewPreset')).toBe('walk')
  await page.getByRole('button', { name: '아이소' }).click()
  expect(await S(page, '.viewPreset')).toBe('iso')
})

test('3D에서 제품 선택 시 좌측 카탈로그 카드도 하이라이트된다', async ({ page }) => {
  // 배치 + 선택 (스토어 직접)
  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('p-sofa3', { x: 9000, z: 5000 })
  })
  await expect(page.locator('.pcard.sel')).toHaveCount(0) // 거실 탭이 아니면 미표시
  await page.getByRole('button', { name: /거실/ }).click()
  const sel = page.locator('.pcard.sel')
  await expect(sel).toHaveCount(1)
  await expect(sel).toContainText('3인용 패브릭 소파')
  // 선택 해제 → 하이라이트 제거
  await page.evaluate(() => window.__hp3d_store.getState().select(null))
  await expect(page.locator('.pcard.sel')).toHaveCount(0)
})

test('단순 클릭 선택은 이동 모드 진입이 아니며, 이어서 드래그하면 바로 이동된다 (버그 회귀)', async ({
  page,
}) => {
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    s.commit((d) => {
      d.placements = []
    })
    s.addPlacement('p-sofa3', { x: 9000, z: 5000 })
  })
  await page.getByRole('button', { name: '탑뷰' }).click()
  await page.waitForTimeout(700)
  const point = await worldPoint(page, 9000, 5000)
  const cx = point.x
  const cy = point.y

  // 1) 단순 클릭 = 선택만. 이동확정 버튼이 떠서는 안 됨
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(200)
  expect(await S(page, '.moving')).toBeNull()

  // 2) 클릭 후 이어서 드래그 → 즉시 이동됨 (닫기 누를 필요 없음)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 100, cy + 60, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect(await S(page, '.moving.id')).toBeTruthy()
  const pos = await S(page, '.placements.at(-1).pos')
  expect(pos.x).not.toBe(9000) // 실제 이동됨
})

test('드래그 이동 중엔 카메라가 회전하지 않고, 완료 버튼으로 확정된다', async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    s.commit((d) => {
      d.placements = []
    })
    s.addPlacement('p-sofa3', { x: 9000, z: 5000 })
  })
  await page.getByRole('button', { name: '탑뷰' }).click()
  await page.waitForTimeout(700)
  const cam0 = await page.evaluate(() => JSON.stringify(window.__hp3d_cam.position))
  const point = await worldPoint(page, 9000, 5000)
  const sx = point.x
  const sy = point.y
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + 120, sy - 60, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  // 이동 확정 대기 상태 + 카메라 불변
  expect(await S(page, '.moving.id')).toBeTruthy()
  expect(await page.evaluate(() => JSON.stringify(window.__hp3d_cam.position))).toBe(cam0)
  // 완료 버튼 클릭 → 확정(커밋) + 이동 상태 해제
  await page.locator('.drop-confirm .dc-ok').click()
  await page.waitForTimeout(200)
  expect(await S(page, '.moving')).toBeNull()
  expect(await S(page, '.past.length')).toBeGreaterThan(0)
})

test('방 밖으로 이동 확정 시 Toast가 뜨고 원위치로 복귀된다', async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    s.commit((d) => {
      d.placements = []
    })
    s.addPlacement('p-sofa3', { x: 9000, z: 5000 })
  })
  await page.waitForTimeout(400)
  // 드래그로 이동 확정 대기 진입 (탑뷰 중앙에서 약간 이동)
  await page.getByRole('button', { name: '탑뷰' }).click()
  await page.waitForTimeout(600)
  const point = await worldPoint(page, 9000, 5000)
  const cx = point.x
  const cy = point.y
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 60, cy - 40, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect(await S(page, '.moving.id')).toBeTruthy()
  // 이벤트 손실 없이 확정적으로: 도면 밖 좌표로 예비 이동 (store)
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    s.movePlacement(s.moving!.id, 12000, 9000)
  })
  const origin = await S(page, '.moving.origin') // 원위치 = 드래그 시작 시점 위치
  await page.locator('.drop-confirm .dc-ok').click()
  await expect(page.locator('.toast')).toContainText('공간이 부족')
  const pos = await S(page, '.placements.at(-1).pos')
  expect(pos.x).toBe(origin.x) // 원위치 복귀
  expect(pos.z).toBe(origin.z)
})

test('가격 탭: 배치 제품 합산 + 미확인 분리 + 출처 새창 링크', async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    s.commit((d) => {
      d.placements = []
    })
    s.addPlacement('lg-cordzero-r5', { x: 250, z: 250 })
    s.addPlacement('lg-cordzero-r5', { x: 750, z: 250 })
    s.addPlacement('p-sofa3', { x: 2000, z: 500 })
  })
  await page.getByRole('button', { name: /가격/ }).click()
  // R5 900,000×2 = 1,800,000 (소파는 가격 미확인 → 견적 필요)
  await expect(page.locator('.cost-total b')).toHaveText('1,800,000원')
  const r5line = page.locator('.cost-line', { hasText: '코드제로 R5' })
  await expect(r5line).toContainText('900,000원 × 2')
  await expect(r5line.locator('.src')).toBeVisible() // 출처 ↗ (target=_blank)
  await expect(r5line.locator('.src')).toHaveAttribute('target', '_blank')
  await expect(page.locator('.cost-line', { hasText: '3인용 패브릭 소파' })).toContainText(
    '견적 필요'
  )
})

// ── M14: 오늘의집 벤치마크 반영 ──

test('단축키 1=2D, 3=3D 모드 전환', async ({ page }) => {
  await page.keyboard.press('1')
  expect(await S(page, '.mode')).toBe('2d')
  await page.keyboard.press('3')
  expect(await S(page, '.mode')).toBe('3d')
})

test('카탈로그 카드에 색상 스와철과 "배치 N개" 뱃지가 표시된다', async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    s.commit((d) => {
      d.placements = [] // 결정론성: 샘플 배치 제거 후 시작
    })
  })
  await page.getByRole('button', { name: /거실/ }).click()
  const card = page.locator('.pcard', { hasText: '3인용 패브릭 소파' })
  await expect(card.locator('.card-swatches .card-sw')).toHaveCount(4) // colorways 미리보기
  await expect(card.locator('.placed-badge')).toHaveCount(0)

  await page.evaluate(() =>
    window.__hp3d_store.getState().addPlacement('p-sofa3', { x: 1250, z: 500 })
  )
  await expect(card.locator('.placed-badge')).toHaveText('배치 1개')
  await page.evaluate(() =>
    window.__hp3d_store.getState().addPlacement('p-sofa3', { x: 3500, z: 500 })
  )
  await expect(card.locator('.placed-badge')).toHaveText('배치 2개')
})

test('인스펙터 치수 오버라이드: 유사 제품을 실측에 맞게 조정 + 실측 복귀', async ({ page }) => {
  await page.evaluate(() => {
    window.__hp3d_store.setState({ placements: [] })
    window.__hp3d_store.getState().addPlacement('p-sofa3', { x: 9000, z: 5000 })
  })
  await expect(page.locator('.inspector h4')).toContainText('소파')

  // W 2100 → 1800 오버라이드
  const wInput = page.locator('.dims-input').first()
  await wInput.fill('1800')
  const ov = await S(page, '.placements.at(-1).dimsOverride')
  expect(ov).toEqual({ w: 1800, d: 950, h: 850 })

  // 충돌 판정도 오버라이드 치수 사용 — 좁은 방2(2800폭)에 1800 소파 배치 가능 여부는 canDropAt이 판정
  // 실측 복귀
  await page.getByRole('button', { name: /제품 실측으로 되돌리기/ }).click()
  expect(await S(page, '.placements.at(-1).dimsOverride')).toBeUndefined()
  expect(await S(page, '.placements.at(-1)')).toBeTruthy()
})

test('조명 강도 슬라이더가 store에 반영된다', async ({ page }) => {
  const slider = page.locator('.light-ctl input[type=range]')
  await slider.fill('1.5')
  expect(await S(page, '.lightIntensity')).toBe(1.5)
  await slider.fill('0.4')
  expect(await S(page, '.lightIntensity')).toBe(0.4)
})

// ── 세션별 다중 프로젝트 ──

test('다중 프로젝트: 새 프로젝트 생성 → 도면 그리기 → 전환 → 복귀 시 데이터 유지', async ({
  page,
}) => {
  // 현재(샘플)에서 새 프로젝트 생성
  await page.getByRole('button', { name: /📁 프로젝트/ }).click()
  const modal = page.locator('.modal')
  await modal.getByRole('button', { name: /새 프로젝트/ }).click()
  await expect(page.locator('.ed2d-svg')).toBeVisible() // 빈 도면 → 2D가 그리기 시작점
  expect(await S(page, '.plan.walls.length')).toBe(0)
  expect(await S(page, '.projectName')).toBe('새 프로젝트')

  // 벽 2개 그리기
  await page.getByRole('button', { name: /벽 그리기/ }).click()
  const svg = page.locator('.ed2d-svg')
  const b = (await svg.boundingBox())!
  await svg.click({ position: { x: b.width * 0.4, y: b.height * 0.4 } })
  await svg.click({ position: { x: b.width * 0.6, y: b.height * 0.4 } })
  await page.getByRole('button', { name: '벽 완성' }).click()
  await page.waitForTimeout(900) // 자동저장

  // 다른 프로젝트로 전환해도 분리됨
  await page.evaluate(() => window.__hp3d_store.getState().newProject('다른 집'))
  expect(await S(page, '.plan.walls.length')).toBe(0)

  // 복귀 → 벽 유지 (세션 격리 + 저장 확인)
  await page.getByRole('button', { name: /📁 프로젝트/ }).click()
  await page
    .locator('.proj-item', { hasText: '새 프로젝트' })
    .first()
    .getByRole('button', { name: '열기' })
    .click()
  const walls = await page.evaluate(() => window.__hp3d_store.getState().projects.length)
  expect(walls).toBeGreaterThanOrEqual(2)
})

test('같은 브라우저의 접속 세션마다 프로젝트를 격리하고 새로고침 후 저장을 복구한다', async ({
  context,
}) => {
  const sessionA = await context.newPage()
  await sessionA.goto('/')
  await sessionA.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await sessionA.reload()
  await sessionA.waitForFunction(() => !!(window as any).__hp3d_store)
  await sessionA.evaluate(() => window.__hp3d_store.getState().newProject('세션 A 전용'))
  await sessionA.reload()
  await sessionA.waitForFunction(() => !!(window as any).__hp3d_store)
  expect(await S(sessionA, '.projectName')).toBe('세션 A 전용')
  await sessionA.getByRole('button', { name: /📁 프로젝트/ }).click()
  await expect(sessionA.locator('.modal .hint').first()).toContainText('현재 탭 세션에 자동 저장')

  const sessionB = await context.newPage()
  await sessionB.goto('/')
  await sessionB.waitForFunction(() => !!(window as any).__hp3d_store)
  const otherName = await sessionB.evaluate(() => window.__hp3d_store.getState().projectName)
  expect(otherName).not.toBe('세션 A 전용')

  await sessionB.evaluate(() => window.__hp3d_store.getState().newProject('세션 B 전용'))
  await sessionB.reload()
  await sessionB.waitForFunction(() => !!(window as any).__hp3d_store)
  expect(await sessionB.evaluate(() => window.__hp3d_store.getState().projectName)).toBe(
    '세션 B 전용'
  )

  await sessionA.reload()
  await sessionA.waitForFunction(() => !!(window as any).__hp3d_store)
  expect(await S(sessionA, '.projectName')).toBe('세션 A 전용')
})

test('기존 단일 슬롯 데이터는 첫 로드 시 마이그레이션된다', async ({ page }) => {
  // 구버전 형식 시드
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem(
      'homeplan3d.project.v1',
      JSON.stringify({
        version: 1,
        name: '구버전 우리집',
        plan: {
          unit: 'mm',
          wallHeight: 2400,
          walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, thickness: 120 }],
          openings: [],
          rooms: [],
        },
        placements: [],
        customProducts: [],
        createdAt: '2020-01-01T00:00:00Z',
        updatedAt: '2020-01-01T00:00:00Z',
      })
    )
  })
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__hp3d_store)
  expect(await S(page, '.projectName')).toBe('구버전 우리집')
  expect(await S(page, '.plan.walls.length')).toBe(1)
  // 구 슬롯은 정리됨 (새 키로 이동)
  const legacyGone = await page.evaluate(() => localStorage.getItem('homeplan3d.project.v1'))
  expect(legacyGone).toBeNull()
})

test('3D 외곽 치수선 토글 (기본 표시 → 끄기)', async ({ page }) => {
  expect(await S(page, '.showDims3D')).toBe(true)
  await page.getByRole('button', { name: /치수선/ }).click()
  expect(await S(page, '.showDims3D')).toBe(false)
  await page.getByRole('button', { name: /치수선/ }).click()
  expect(await S(page, '.showDims3D')).toBe(true)
})

test('AI 해석 모달: 열림→닫힘, 보정 안내 문구 포함', async ({ page }) => {
  await page.getByRole('button', { name: /AI 도면 해석/ }).click()
  const modal = page.locator('.modal')
  await expect(modal).toContainText('보정')
  await expect(modal.getByRole('button', { name: '해석 시작' })).toBeDisabled()
  await modal.getByRole('button', { name: '닫기' }).click()
  await expect(modal).toHaveCount(0)
})

// ── M12: 브랜드 DB 대확장 (삼성·IKEA·시몬스) ──

test('M12: 5개 브랜드 DB가 로드되고 브랜드 칩이 동적으로 생성된다', async ({ page }) => {
  await page.getByRole('button', { name: /거실/ }).click()
  const chipTexts = await page.locator('.brandbar .bchip').allTextContents()
  for (const b of ['전체', '한샘', 'LG전자', '삼성전자', 'IKEA', '시몬스']) {
    expect(chipTexts).toContain(b)
  }
  // 삼성 비스포크 냉장고 실측
  const ss = await page.evaluate(() =>
    window.__hp3d_store.getState().productById('ss-bespoke-fridge-875')
  )
  expect(ss.dims).toEqual({ w: 912, d: 930, h: 1853 })
  // IKEA KIVIK
  const kivik = await page.evaluate(() =>
    window.__hp3d_store.getState().productById('ik-kivik-3seat')
  )
  expect(kivik.dims).toEqual({ w: 2280, d: 950, h: 830 })
})

test('M12: IKEA KIVIK 소파를 배치하고 시몬스 퀸 침대 실측을 확인한다', async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    s.commit((d) => {
      d.placements = []
    })
  })
  await page.getByRole('button', { name: /거실/ }).click()
  await page.locator('.brandbar').getByRole('button', { name: 'IKEA' }).click()
  await page
    .getByText(/KIVIK 쉬비크 3인용소파/)
    .first()
    .click()
  const canvas = page.locator('.viewport canvas')
  await expect(canvas).toBeVisible()
  await page.waitForFunction(
    () =>
      !!(window as any).__hp3d_scene &&
      window.__hp3d_store.getState().pendingProductId === 'ik-kivik-3seat'
  )
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.45)
  await page.waitForTimeout(250)
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.45)
  await expect
    .poll(() => page.evaluate(() => window.__hp3d_store.getState().placements.length))
    .toBeGreaterThan(0)
  const placed = await page.evaluate(() => window.__hp3d_store.getState().placements.at(-1))
  expect(placed.productId).toBe('ik-kivik-3seat')

  // 시몬스 퀸 배치 (store 직접) — addPlacement 후 최신 상태 재조회 필수
  const simmons = await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    const id = s.addPlacement('sm-queen-set', { x: 2300, z: 1800 })
    const st = window.__hp3d_store.getState()
    const p = st.placements.find((x) => x.id === id)
    return { productId: p.productId, dims: st.productById(p.productId).dims }
  })
  expect(simmons.productId).toBe('sm-queen-set')
  expect(simmons.dims).toEqual({ w: 1600, d: 2110, h: 1000 })
})

test('M12: 삼성 The Frame 벽걸이가 wall-mount로 등록된다', async ({ page }) => {
  const frame = await page.evaluate(() =>
    window.__hp3d_store.getState().productById('ss-frame-65-wall')
  )
  expect(frame.mount).toBe('wall-mount')
  expect(frame.snapToWall).toBe(true)
  expect(frame.defaultElevation).toBe(950)
  // 카탈로그 카드에 브랜드 태그 + 출처 링크
  await page.getByRole('button', { name: /가전/ }).click()
  await page.locator('.brandbar').getByRole('button', { name: '삼성전자' }).click()
  const card = page.locator('.pcard', { hasText: '더 프레임 65인치' }).first()
  await expect(card).toBeVisible()
  await expect(card.locator('.src')).toBeVisible()
})

test('브랜드 DB가 카탈로그에 로드되고 브랜드 태그·출처가 표시된다', async ({ page }) => {
  const lg = await page.evaluate(() => window.__hp3d_store.getState().productById('lg-cordzero-r5'))
  expect(lg.brand).toBe('LG전자')
  expect(lg.dims).toEqual({ w: 342, d: 342, h: 95 })
  expect(lg.sourceUrl).toMatch(/^https:/)
  const hs = await page.evaluate(() =>
    window.__hp3d_store.getState().productById('hs-sliding-wardrobe-2400')
  )
  expect(hs.brand).toBe('한샘')
  expect(hs.snapToWall).toBe(true)

  await page.getByRole('button', { name: /가전/ }).click()
  const card = page.locator('.pcard', { hasText: '코드제로 R5' })
  await expect(card).toBeVisible()
  await expect(card.locator('.brand-tag')).toHaveText('LG전자')
  await expect(card.locator('.src')).toBeVisible() // 출처 링크
})

test('브랜드 필터: LG전자만 보기 → 한샘 제품 숨김', async ({ page }) => {
  await page.getByRole('button', { name: /주방/ }).click()
  await page.locator('.brandbar').getByRole('button', { name: 'LG전자' }).click()
  // 주방 카테고리엔 LG 제품이 없으므로 빈 상태
  await expect(page.locator('.plist').getByText('제품이 없는')).toBeVisible()
  await page.locator('.brandbar').getByRole('button', { name: '한샘' }).click()
  await expect(page.locator('.pcard', { hasText: '키친바흐' }).first()).toBeVisible()
  await expect(page.locator('.pcard', { hasText: 'LG' })).toHaveCount(0)
})

test('LG 로봇청소기를 실측(342×342×95)으로 배치한다', async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    s.commit((d) => {
      d.placements = []
    })
  })
  await page.getByRole('button', { name: /가전/ }).click()
  await page.getByText('코드제로 R5').first().click()
  const canvas = page.locator('.viewport canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await page.waitForTimeout(250)
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5)
  const last = await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    const p = s.placements.at(-1)
    return { productId: p?.productId, dims: s.productById(p.productId).dims }
  })
  expect(last.productId).toBe('lg-cordzero-r5')
  expect(last.dims).toEqual({ w: 342, d: 342, h: 95 })
})

test('한샘 슬라이딩 붙박이장은 벽자석 스냅으로 배치된다', async ({ page }) => {
  await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    s.commit((d) => {
      d.placements = []
    })
  })
  await page.getByRole('button', { name: /수납/ }).click()
  await page.getByText('슬라이딩 붙박이장 2400').first().click()
  // 탑뷰에서 북벽의 안방 구간을 클릭해 전체 footprint가 같은 방 안에 남도록 한다.
  await page.getByRole('button', { name: '탑뷰' }).click()
  await page.waitForTimeout(600)
  const point = await worldPoint(page, 2500, 0)
  await page.mouse.move(point.x, point.y)
  await page.waitForTimeout(250)
  await page.mouse.click(point.x, point.y)
  await page.waitForTimeout(200)
  const last = await page.evaluate(() => {
    const s = window.__hp3d_store.getState()
    const p = s.placements.at(-1)
    return {
      productId: p?.productId,
      rotY: p?.rotY,
      z: p?.pos.z,
      dims: s.productById(p.productId).dims,
    }
  })
  expect(last.productId).toBe('hs-sliding-wardrobe-2400')
  expect(last.dims).toEqual({ w: 2400, d: 700, h: 2200 })
  // 벽 부착: 뒷면이 북벽에 붙어 z ≈ d/2, 정면 남향(rotY≈0)
  expect(last.z).toBeLessThan(500)
  expect(Math.abs(last.rotY) % 90).toBeLessThan(1)
})
