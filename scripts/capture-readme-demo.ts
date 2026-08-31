import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'

const APP_URL = process.env.HOMEPLAN_DEMO_URL ?? 'http://127.0.0.1:5173'
const FRAME_WIDTH = 960
const FRAME_HEIGHT = 540
const FRAME_DELAY_MS = 200
const TARGET_FRAMES = 150
const OUTPUT = resolve('docs/assets/homeplan-3d-demo.gif')
const FIXTURE = resolve('e2e/fixtures/real-korean-33pyeong.png')

async function ensureReady() {
  try {
    const response = await fetch(APP_URL)
    if (!response.ok) throw new Error(String(response.status))
  } catch {
    throw new Error(`Start the app first with "npm run dev". Could not reach ${APP_URL}.`)
  }
  await stat(FIXTURE)
  await mkdir(resolve('docs/assets'), { recursive: true })
}

async function installDemoCursor(page: Page) {
  await page.evaluate(() => {
    const cursor = document.createElement('div')
    cursor.id = 'readme-demo-cursor'
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '32px',
      top: '32px',
      width: '18px',
      height: '18px',
      border: '3px solid #ffb300',
      borderRadius: '50%',
      boxShadow: '0 0 0 5px #ffb30038',
      zIndex: '9999',
      pointerEvents: 'none',
      transition: 'left 180ms ease, top 180ms ease, transform 120ms ease',
    })
    document.body.appendChild(cursor)

    const caption = document.createElement('div')
    caption.id = 'readme-demo-caption'
    Object.assign(caption.style, {
      position: 'fixed',
      right: '20px',
      top: '76px',
      maxWidth: '300px',
      padding: '11px 15px',
      color: '#f7f8f2',
      background: '#172019eb',
      borderLeft: '5px solid #b9f227',
      boxShadow: '0 8px 28px #0000002b',
      fontFamily: 'Inter, Pretendard, sans-serif',
      fontSize: '15px',
      fontWeight: '750',
      lineHeight: '1.35',
      letterSpacing: '-0.01em',
      zIndex: '9998',
      pointerEvents: 'none',
      transition: 'opacity 160ms ease, transform 160ms ease',
    })
    document.body.appendChild(caption)
  })
}

async function main() {
  await ensureReady()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()
  const frames: Buffer[] = []

  async function frame() {
    frames.push(await page.screenshot({ type: 'png' }))
  }

  async function hold(milliseconds: number) {
    const count = Math.max(1, Math.round(milliseconds / FRAME_DELAY_MS))
    for (let index = 0; index < count && frames.length < TARGET_FRAMES; index++) {
      await frame()
      await page.waitForTimeout(70)
    }
  }

  async function pointTo(locator: Locator) {
    const box = await locator.boundingBox()
    if (!box) return
    await pointAt(box.x + box.width / 2, box.y + box.height / 2)
  }

  async function pointAt(x: number, y: number) {
    await page.evaluate(
      ({ x, y }) => {
        const cursor = document.getElementById('readme-demo-cursor')
        if (!cursor) return
        cursor.style.left = `${x - 9}px`
        cursor.style.top = `${y - 9}px`
      },
      { x, y }
    )
    await hold(400)
  }

  async function caption(step: string, title: string) {
    await page.evaluate(
      ({ step, title }) => {
        const node = document.getElementById('readme-demo-caption')
        if (!node) return
        node.style.opacity = '0'
        node.style.transform = 'translateY(-5px)'
        setTimeout(() => {
          node.textContent = `${step}  ${title}`
          node.style.opacity = '1'
          node.style.transform = 'translateY(0)'
        }, 90)
      },
      { step, title }
    )
    await hold(400)
  }

  async function click(locator: Locator) {
    await pointTo(locator)
    await page.evaluate(() => {
      const cursor = document.getElementById('readme-demo-cursor')
      if (cursor) cursor.style.transform = 'scale(.65)'
    })
    await locator.click()
    await frame()
    await page.evaluate(() => {
      const cursor = document.getElementById('readme-demo-cursor')
      if (cursor) cursor.style.transform = 'scale(1)'
    })
  }

  try {
    await page.addInitScript(() => localStorage.clear())
    await page.goto(APP_URL)
    await page.waitForFunction(() => !!window.__hp3d_store)
    await page.locator('.viewport canvas').waitFor()
    await page.waitForTimeout(1200)
    await installDemoCursor(page)
    await caption('01', 'Upload a real floor plan')
    await hold(800)

    await click(page.getByRole('button', { name: '평면도 업로드 → 3D' }))
    await hold(600)

    const modal = page.locator('.modal')
    await pointTo(modal.getByLabel('평면도 이미지 업로드'))
    await modal.getByLabel('평면도 이미지 업로드').setInputFiles(FIXTURE)
    await hold(1000)

    const widthInput = modal.getByLabel('도면 전체 가로 실측')
    await caption('02', 'Calibrate one known dimension')
    await pointTo(widthInput)
    await widthInput.fill('11800')
    await modal.locator('.pv-scale-state.calibrated').waitFor()
    await hold(1000)

    await caption('03', 'Compare the source and vector draft')
    await modal.evaluate((element) =>
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    )
    await hold(1000)

    await click(modal.getByRole('button', { name: '변환 결과 적용' }))
    await modal.getByRole('heading', { name: '변환 적용 완료' }).waitFor()
    await hold(800)

    await caption('04', 'Review the editable SVG draft')
    await click(modal.getByRole('button', { name: /2D에서.*(보정|검수)/ }))
    const review = page.getByRole('complementary', { name: '변환 초안 검수', exact: true })
    await review.waitFor()
    await review.getByLabel('대표 검수 요소').selectOption({ index: 1 })
    await review.getByLabel('수정 불필요').check()
    await review.getByLabel('검수 근거').fill('대표 외벽의 연결과 길이가 원본과 일치합니다.')
    await hold(1200)

    await caption('05', 'Unlock 3D with review evidence')
    await click(review.getByRole('button', { name: /검수 근거 저장하고 3D 보기/ }))
    await page.locator('.viewport canvas').waitFor()
    await hold(1200)

    await caption('06', 'Place real-size retail products')
    await click(page.getByRole('button', { name: '탑뷰' }))
    await click(page.getByRole('button', { name: /거실/ }))
    await click(page.locator('.brandbar').getByRole('button', { name: 'IKEA' }))
    const kivik = page.locator('.pcard', { hasText: /KIVIK 쉬비크 3인용소파/ }).first()
    await kivik.scrollIntoViewIfNeeded()
    await click(kivik)
    await page.waitForFunction(
      () => window.__hp3d_store.getState().pendingProductId === 'ik-kivik-3seat'
    )
    const placementCandidates = await page.evaluate(() =>
      window.__hp3d_store
        .getState()
        .plan.rooms.map((room) => {
          const xs = room.polygon.map((point) => point.x)
          const zs = room.polygon.map((point) => point.y)
          const minX = Math.min(...xs)
          const maxX = Math.max(...xs)
          const minZ = Math.min(...zs)
          const maxZ = Math.max(...zs)
          return {
            x: (minX + maxX) / 2,
            z: (minZ + maxZ) / 2,
            area: (maxX - minX) * (maxZ - minZ),
          }
        })
        .sort((left, right) => right.area - left.area)
    )
    let placed = false
    for (const candidate of placementCandidates) {
      const placementPoint = await page.evaluate(({ x, z }) => {
        const camera = window.__hp3d_cam
        const canvas = document.querySelector('.viewport canvas')
        if (!camera || !canvas) throw new Error('3D scene projection is not ready')
        const rect = canvas.getBoundingClientRect()
        const projected = camera.position.clone().set(x, 0, z).project(camera)
        return {
          x: rect.x + ((projected.x + 1) / 2) * rect.width,
          y: rect.y + ((1 - projected.y) / 2) * rect.height,
        }
      }, candidate)
      await pointAt(placementPoint.x, placementPoint.y)
      await page.mouse.click(placementPoint.x, placementPoint.y)
      await page.waitForTimeout(250)
      placed = await page.evaluate(() =>
        window.__hp3d_store
          .getState()
          .placements.some((placement) => placement.productId === 'ik-kivik-3seat')
      )
      if (placed) break
    }
    if (!placed) throw new Error('Could not place KIVIK in any detected room')
    await hold(1200)

    await caption('07', 'See the price update immediately')
    await click(page.getByRole('button', { name: /가격/ }))
    await page.locator('[data-testid="live-cost-total"]').waitFor()
    await hold(1200)

    await caption('08', 'Walk the space — and jump')
    await click(page.getByRole('button', { name: /워크스루/ }))
    await page.keyboard.press('Space')
    await page.keyboard.down('KeyW')
    await hold(1400)
    await page.keyboard.up('KeyW')
    await hold(600)

    await click(page.getByRole('button', { name: '아이소' }))
    await caption('READY', 'Plan it. Place it. Walk it.')
    await hold(1000)

    while (frames.length < TARGET_FRAMES) frames.push(frames.at(-1)!)
    const selected = frames.slice(0, TARGET_FRAMES)
    const rawFrames: Buffer[] = []
    for (const png of selected) {
      rawFrames.push(
        await sharp(png)
          .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
          .ensureAlpha()
          .raw()
          .toBuffer()
      )
    }
    await sharp(Buffer.concat(rawFrames), {
      raw: {
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT * rawFrames.length,
        channels: 4,
        pageHeight: FRAME_HEIGHT,
      },
    })
      .gif({
        loop: 0,
        delay: Array(rawFrames.length).fill(FRAME_DELAY_MS),
        colours: 128,
        effort: 8,
        dither: 0.65,
        interFrameMaxError: 8,
        keepDuplicateFrames: true,
      })
      .toFile(OUTPUT)
    const info = await stat(OUTPUT)
    console.log(`Created ${OUTPUT} (${(info.size / 1024 / 1024).toFixed(2)} MiB, 30s)`)
  } finally {
    await context.close()
    await browser.close()
  }
}

await main()
