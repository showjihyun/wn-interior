// 브랜드 실측 DB 시각 검증 — 한샘·LG 제품 배치 후 스크린샷
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

mkdirSync('shots', { recursive: true })
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.addInitScript(() => localStorage.clear())
await page.goto('http://localhost:5173')
await page.waitForFunction(() => !!window.__hp3d_store)
await page.waitForTimeout(1200)

// 기존 가구 비우고 브랜드 제품으로 채움
await page.evaluate(() => {
  const s = window.__hp3d_store.getState()
  s.commit((d) => {
    d.placements = []
    // 거실·주방: LG OLED TV(거치) + 코드제로 R5 + 에어로타워 + 디오스 냉장고
    d.placements.push(
      { id: 'v1', productId: 'lg-oled65c5', pos: { x: 6800, y: 0, z: 5600 }, rotY: 180 },
      { id: 'v2', productId: 'lg-cordzero-r5', pos: { x: 6800, y: 0, z: 3200 }, rotY: 20 },
      { id: 'v3', productId: 'lg-puricare-aerotower', pos: { x: 8200, y: 0, z: 6900 }, rotY: 180 },
      { id: 'v4', productId: 'lg-dios-fitmax', pos: { x: 10230, y: 0, z: 500 }, rotY: 0 },
      // 안방: 한샘 슬라이딩 붙박이장(벽 스냅 위치)
      { id: 'v5', productId: 'hs-sliding-wardrobe-2400', pos: { x: 2350, y: 0, z: 400 }, rotY: 0 },
      // 현관: 한샘 신발장
      { id: 'v6', productId: 'hs-shoe-wardrobe-900', pos: { x: 3720, y: 0, z: 4830 }, rotY: 180 },
    )
  })
})
await page.waitForTimeout(800)
await page.screenshot({ path: 'shots/16-brand-db-iso.png' })

// 탑뷰
await page.getByRole('button', { name: '탑뷰' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: 'shots/17-brand-db-top.png' })

// 카탈로그: 브랜드 필터 UI 확인
await page.getByRole('button', { name: '아이소' }).click()
await page.getByRole('button', { name: /가전/ }).click()
await page.locator('.brandbar').getByRole('button', { name: 'LG전자' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: 'shots/18-brand-filter.png' })

console.log('pageerrors:', errors.length === 0 ? '없음 ✅' : errors.slice(0, 3))
await browser.close()
