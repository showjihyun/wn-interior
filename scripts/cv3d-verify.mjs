// CV 2D→3D 전환 전 과정 상세 검증 — 단계별 스크린샷 + 3D 픽셀 검증
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'fs'

const OUT = 'shots'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

await page.addInitScript(() => localStorage.clear())

// ── 검증용 합성 도면 (기하학 정보 명확): 10m×7m 외곽 + 내벽(문 갭) + 얇은 치수선 ──
async function makePlanPng() {
  return await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 800
    c.height = 560
    const g = c.getContext('2d')
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 800, 560)
    g.strokeStyle = '#111'
    g.lineCap = 'butt'
    const wall = (x1, y1, x2, y2) => {
      g.lineWidth = 10
      g.beginPath()
      g.moveTo(x1, y1)
      g.lineTo(x2, y2)
      g.stroke()
    }
    // 외곽: 상단 벽에 60px 문 갭 (x 350~410)
    wall(30, 30, 350, 30)
    wall(410, 30, 770, 30)
    wall(30, 530, 770, 530)
    wall(30, 30, 30, 530)
    wall(770, 30, 770, 530)
    // 내벽: 세로 1개 (x=400, y 30~530) — 거실/방 분리
    wall(400, 30, 400, 530)
    // 얇은 치수선 (필터 대상)
    g.lineWidth = 2
    g.beginPath(); g.moveTo(30, 10); g.lineTo(770, 10); g.stroke()
    g.font = '20px sans-serif'
    g.fillStyle = '#333'
    g.fillText('740', 380, 25)
    return c.toDataURL('image/png')
  })
}

async function runFlow(name, pngBuf) {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('http://localhost:5173/')
  await page.waitForFunction(() => !!(window).__hp3d_store)
  await page.waitForTimeout(800)

  console.log(`\n===== [${name}] 1) CV 모달 + 업로드 =====`)
  await page.getByRole('button', { name: /도면 자동 변환/ }).click()
  await page.locator('.modal input[type=file]').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: pngBuf })
  await expect2(page, '.pv-split img', 10000) // 좌: 원본 / 우: 프리뷰 분할 확인
  await page.waitForTimeout(1200) // 디바운스 실행
  await page.screenshot({ path: `${OUT}/cv-${name}-1-preview.png` })

  console.log(`[${name}] 2) 검출 상태`)
  const status = await page.locator('.status').textContent()
  console.log('  status:', status)

  console.log(`[${name}] 3) 변환 적용 → 2D 편집기`)
  await page.locator('.modal').getByRole('button', { name: /3D 평면도로 변환 적용/ }).click()
  await expect2(page, '.ed2d-svg', 10000)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/cv-${name}-2-2d.png` })
  const plan = await page.evaluate(() => {
    const s = (window).__hp3d_store.getState()
    return {
      walls: s.plan.walls.length,
      rooms: s.plan.rooms.length,
      openings: s.plan.openings.length,
      roomNames: s.plan.rooms.map((r) => r.name),
      wallThick: s.plan.walls.map((w) => Math.round(w.thickness)),
    }
  })
  console.log('  plan:', JSON.stringify(plan))

  console.log(`[${name}] 4) 3D 전환 (아이소) → 렌더 검증`)
  await page.getByRole('button', { name: '3D 배치' }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/cv-${name}-3-iso.png` })
  // 픽셀 검증: 벽(밝은 회색) + 바닥(마감재 색) 존재
  const pixels = await page.evaluate(() => {
    const renderer = (window).__hp3d_gl
    const glc = renderer.getContext()
    const w = renderer.domElement.width
    const h = renderer.domElement.height
    const px = new Uint8Array(w * h * 4)
    glc.readPixels(0, 0, w, h, glc.RGBA, glc.UNSIGNED_BYTE, px)
    let wallLike = 0
    let floorLike = 0
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g2 = px[i + 1], b = px[i + 2]
      // 벽 회색 (#c8cdd2 근처)
      if (Math.abs(r - 200) < 30 && Math.abs(g2 - 205) < 30 && Math.abs(b - 210) < 30) wallLike++
      // 바닥 오크/장판 (밝은 베이지)
      if (r > 170 && g2 > 140 && b > 100 && r > b) floorLike++
    }
    return { wallLike, floorLike }
  })
  console.log('  pixels:', JSON.stringify(pixels))

  console.log(`[${name}] 5) 탑뷰 → 평면 대응 확인`)
  await page.getByRole('button', { name: '탑뷰' }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/cv-${name}-4-top.png` })
  return { plan, pixels, status }
}

async function expect2(page, sel, timeout) {
  return page.locator(sel).first().waitFor({ state: 'visible', timeout })
}

// ── A. 합성 도면 (기하학 명확) ──
const synthBuf = Buffer.from((await makePlanPng()).replace(/^data:image\/png;base64,/, ''), 'base64')
const synth = await runFlow('synthetic', synthBuf)

console.log('\n===== 합성 도면 품질 판정 =====')
const q1 = {
  wallsOk: synth.plan.walls >= 4,
  roomsOk: synth.plan.rooms >= 2,
  openingOk: synth.plan.openings >= 1,
  thicknessOk: synth.plan.wallThick.every((t) => t >= 150 && t <= 300), // 10px × 20mm/px = 200mm
  render3dOk: synth.pixels.wallLike > 1000 && synth.pixels.floorLike > 1000,
}
console.log('Q1:', JSON.stringify(q1))

// ── B. FOCSA 실도면 ──
let focsa = null
const focsaPath = 'e2e/fixtures/real-focsa-apt.jpg'
if (readFileSync(focsaPath)) {
  console.log('\n===== [FOCSA 실도면] 전체 흐름 =====')
  const buf = readFileSync(focsaPath)
  focsa = await runFlow('focsa', buf)
  console.log('FOCSA plan:', JSON.stringify(focsa.plan))
}

console.log('pageerrors:', errors.length === 0 ? '없음 ✅' : errors.slice(0, 3))
await browser.close()
