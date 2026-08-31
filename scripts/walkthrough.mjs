// 실브라우저 상세 워크스루 — 각 기능을 직접 조작하고 단계별 스크린샷 저장
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const OUT = 'shots'
mkdirSync(OUT, { recursive: true })
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const wait = (ms) => page.waitForTimeout(ms)

await page.addInitScript(() => localStorage.clear())
console.log('▶ 앱 로드')
await page.goto('http://localhost:5173')
await page.waitForFunction(() => !!window.__hp3d_store)
await wait(1200)
await shot(page, '01-initial-iso')

console.log('▶ 탑뷰 전환')
await page.getByRole('button', { name: '탑뷰' }).click()
await wait(800)
await shot(page, '02-topview')

console.log('▶ 아이소 복귀 + 소파 고스트')
await page.getByRole('button', { name: '아이소' }).click()
await page.getByRole('button', { name: /거실/ }).click()
await page.getByText('3인용 패브릭 소파').first().click()
const canvas = page.locator('.viewport canvas')
const box = await canvas.boundingBox()
const cx = box.x + box.width * 0.55
const cy = box.y + box.height * 0.62
await page.mouse.move(cx - 200, cy - 150)
await wait(200)
await page.mouse.move(cx, cy)
await wait(400)
await shot(page, '03-ghost-sofa')

console.log('▶ 클릭 배치 확정 → 선택 링/인스펙터')
await page.mouse.click(cx, cy)
await wait(500)
await shot(page, '04-placed-selected')

console.log('▶ 색상 변경')
await page.locator('.swatches .sw').nth(3).click()
await wait(400)
await shot(page, '05-color-changed')

console.log('▶ 마감재: 안방 바닥재 → 세라믹 타일')
await page.getByRole('button', { name: /마감재/ }).click()
await page.locator('.mroom').first().locator('select').first().selectOption('f-tile-gray')
await wait(600)
await shot(page, '06-floor-tile')

console.log('▶ 벽걸이 TV 배치 + 설치 높이 조절')
await page.locator('.tabs').getByRole('button', { name: /배치/ }).click() // 카탈로그 탭 복귀
// 결정론성: 기존 가구 비움 (클릭이 반드시 바닥/고스트에 닿도록)
await page.evaluate(() => {
  window.__hp3d_store.setState({ placements: [] })
})
await page.getByRole('button', { name: /가전/ }).click()
await page.getByText('75인치 TV 벽걸이').first().click()
const tx = box.x + box.width * 0.5
const ty = box.y + box.height * 0.35
await page.mouse.move(tx, ty)
await wait(300)
await page.mouse.click(tx, ty)
await wait(400)
await page.locator('.inspector input[type=range]').fill('1000')
await wait(400)
await shot(page, '07-tvwall-mounted')

console.log('▶ 배치안 저장 모달')
await page.getByRole('button', { name: /배치안 비교/ }).click()
await page.locator('.modal').getByPlaceholder(/배치안 이름/).fill('A안 - 거실 중심')
await page.locator('.modal').getByRole('button', { name: '현재 상태 저장' }).click()
await wait(600)
await shot(page, '08-variants-saved')
await page.locator('.modal').getByRole('button', { name: '닫기' }).click()

console.log('▶ AI 해석 모달')
await page.getByRole('button', { name: /AI 도면 해석/ }).click()
await wait(300)
await shot(page, '09-ai-modal')
await page.locator('.modal').getByRole('button', { name: '닫기' }).click()

console.log('▶ 2D 도면편집 모드')
await page.getByRole('button', { name: '2D 도면편집' }).click()
await wait(500)
await shot(page, '10-editor-2d')

console.log('▶ 2D 벽 그리기 (두 점 → 완성)')
await page.getByRole('button', { name: /벽 그리기/ }).click()
const svg = page.locator('.ed2d-svg')
const sb = await svg.boundingBox()
await svg.click({ position: { x: sb.width * 0.42, y: sb.height * 0.32 } })
await page.mouse.move(sb.x + sb.width * 0.62, sb.y + sb.height * 0.32)
await wait(250)
await shot(page, '11-wall-preview')
await svg.click({ position: { x: sb.width * 0.62, y: sb.height * 0.32 } })
await page.getByRole('button', { name: '벽 완성' }).click()
await wait(300)
await shot(page, '12-wall-completed')

console.log('▶ 2D 문 배치')
await page.getByRole('button', { name: /^문$/ }).click()
await svg.click({ position: { x: sb.width * 0.45, y: sb.height * 0.15 } })
await wait(300)
const oid = await page.evaluate(() => window.__hp3d_store.getState().plan.openings.at(-1)?.id)
const rc = await page.evaluate((id) => {
  const r = document.querySelector('[data-testid="opening-' + id + '"] > rect').getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}, oid)
await page.mouse.click(rc.x, rc.y)
await wait(300)
await shot(page, '13-door-placed-panel')

console.log('▶ 워크스루 (1인칭)')
await page.getByRole('button', { name: '3D 배치' }).click()
await page.getByRole('button', { name: /워크스루/ }).click()
await wait(900)
await shot(page, '14-walkthrough')
// WASD 걷기 몇 걸음
await page.keyboard.down('KeyW')
await wait(700)
await page.keyboard.up('KeyW')
await wait(300)
await shot(page, '15-walkthrough-moved')

console.log('최종 콘솔 에러:', errors.length === 0 ? '없음 ✅' : JSON.stringify(errors.slice(0, 5)))
await browser.close()
