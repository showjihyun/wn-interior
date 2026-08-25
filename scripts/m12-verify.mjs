// M12 브랜드 믹스 배치안 시각 검증 — 5개 브랜드 제품으로 모의 인테리어
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

await page.evaluate(() => {
  const s = window.__hp3d_store.getState()
  s.commit((d) => {
    d.placements = [
      // 거실: IKEA KIVIK 소파(남향) + 삼성 The Frame(마주봄) + LACK 커피테이블 + LG 로봇청소기 + FADO 조명
      { id: 'm1', productId: 'ik-kivik-3seat', pos: { x: 6800, y: 0, z: 4300 }, rotY: 0 },
      { id: 'm2', productId: 'ss-frame-65-stand', pos: { x: 6800, y: 0, z: 5900 }, rotY: 180 },
      { id: 'm3', productId: 'ik-lack-coffee', pos: { x: 6800, y: 0, z: 3050 }, rotY: 0 },
      { id: 'm4', productId: 'lg-cordzero-r5', pos: { x: 5900, y: 0, z: 2600 }, rotY: 40 },
      { id: 'm5', productId: 'ik-fado-lamp', pos: { x: 5300, y: 0, z: 6700 }, rotY: 0 },
      // 주방: 한샘 키친바흐 + LG 디오스 냉장고
      { id: 'm6', productId: 'hs-kitchenbach-lower', pos: { x: 8700, y: 0, z: 320 }, rotY: 0 },
      { id: 'm7', productId: 'lg-dios-fitmax', pos: { x: 10230, y: 0, z: 500 }, rotY: 0 },
      // 안방: 시몬스 퀸 침대 + IKEA BILLY 책장(서벽)
      { id: 'm8', productId: 'sm-queen-set', pos: { x: 2300, y: 0, z: 1100 }, rotY: 0 },
      { id: 'm9', productId: 'ik-billy-bookcase', pos: { x: 4380, y: 0, z: 3400 }, rotY: -90 },
      // 현관: 한샘 신발장
      { id: 'm10', productId: 'hs-shoe-wardrobe-900', pos: { x: 3720, y: 0, z: 4830 }, rotY: 180 },
    ]
  })
})
await page.waitForTimeout(900)
await page.screenshot({ path: 'shots/19-m12-mix-iso.png' })

await page.getByRole('button', { name: '탑뷰' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: 'shots/20-m12-mix-top.png' })

// 카탈로그 브랜드 칩 UI
await page.getByRole('button', { name: '아이소' }).click()
await page.getByRole('button', { name: /침실/ }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: 'shots/21-m12-brand-chips.png' })

console.log('pageerrors:', errors.length === 0 ? '없음 ✅' : errors.slice(0, 3))
await browser.close()
