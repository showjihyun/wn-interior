import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'

const APP_URL = process.env.HOMEPLAN_DEMO_URL ?? 'http://127.0.0.1:5173'
const FRAME_WIDTH = 960
const FRAME_HEIGHT = 540
const FRAME_DELAY_MS = 200
const TARGET_FRAMES = 100
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
    await page.evaluate(
      ({ x, y }) => {
        const cursor = document.getElementById('readme-demo-cursor')
        if (!cursor) return
        cursor.style.left = `${x - 9}px`
        cursor.style.top = `${y - 9}px`
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 }
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
    await hold(1400)

    await click(page.getByRole('button', { name: '평면도 업로드 → 3D' }))
    await hold(1200)

    const modal = page.locator('.modal')
    await pointTo(modal.getByLabel('평면도 이미지 업로드'))
    await modal.getByLabel('평면도 이미지 업로드').setInputFiles(FIXTURE)
    await hold(1800)

    const widthInput = modal.getByLabel('도면 전체 가로 실측')
    await pointTo(widthInput)
    await widthInput.fill('11800')
    await modal.locator('.pv-scale-state.calibrated').waitFor()
    await hold(1800)

    await modal.evaluate((element) =>
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    )
    await hold(1800)

    await click(modal.getByRole('button', { name: '변환 결과 적용' }))
    await modal.getByRole('heading', { name: '변환 적용 완료' }).waitFor()
    await hold(1600)

    await click(modal.getByRole('button', { name: '바로 3D 보기' }))
    await page.locator('.viewport canvas').waitFor()
    await hold(3000)

    await click(page.getByRole('button', { name: '2D 도면편집' }))
    await page.getByRole('complementary', { name: '변환 초안 검수' }).waitFor()
    await hold(2800)

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
    console.log(`Created ${OUTPUT} (${(info.size / 1024 / 1024).toFixed(2)} MiB, 20s)`)
  } finally {
    await context.close()
    await browser.close()
  }
}

await main()
