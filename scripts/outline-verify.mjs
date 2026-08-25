// 선택 테두리 효과 시각 검증 — 제품 선택 시 아웃라인 표시 확인
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
await page.addInitScript(() => localStorage.clear())
await page.goto('http://localhost:5173')
await page.waitForFunction(() => !!window.__hp3d_store)
await page.waitForTimeout(1200)

// 소파 배치 + 선택
await page.evaluate(() => {
  const s = window.__hp3d_store.getState()
  s.addPlacement('p-sofa3', { x: 6800, z: 4300 })
})
await page.waitForTimeout(600)
await page.screenshot({ path: 'shots/22-outline-selected.png' })

// 탑뷰에서도 확인
await page.getByRole('button', { name: '탑뷰' }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: 'shots/23-outline-top.png' })

await browser.close()
console.log('done')
