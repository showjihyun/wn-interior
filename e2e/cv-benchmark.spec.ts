// M18 CV 벤치마크 — 다운로드한 실도면 이미지들을 planVision 파이프라인으로 일괄 변환·평가
// (LLM/네트워크 불필요 — fixtures의 로컬 이미지 대상, 결정론)
import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs'
import { buildPlanFromImage, autoThresholdOtsu, toGray, invertGray, inkRatio } from '../src/engine/planVision'
import type { Gray } from '../src/engine/planVision'

const FIXTURES = 'e2e/fixtures'
const IMAGES = readdirSync(FIXTURES).filter((f) => /\.(png|jpe?g)$/i.test(f))

interface Row {
  image: string
  px: string
  ms: number
  walls: number
  rooms: number
  openings: number
  mmPerPx: number
  largestRoomM2: number
}

test.describe.configure({ mode: 'serial' })

for (const file of IMAGES) {
  test(`CV 변환: ${file}`, async ({ page }) => {
    test.setTimeout(60_000)
    const buf = readFileSync(`${FIXTURES}/${file}`)
    const dataUrl = `data:image/${file.endsWith('.png') ? 'png' : 'jpeg'};base64,${buf.toString('base64')}`
    await page.goto('about:blank')

    // 페이지 캔버스로 디코딩 → Gray 추출
    const gray = (await page.evaluate(async (src) => {
      const im = new Image()
      im.src = src
      await im.decode()
      const scale = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(im.naturalWidth * scale)
      c.height = Math.round(im.naturalHeight * scale)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(im, 0, 0, c.width, c.height)
      const id = ctx.getImageData(0, 0, c.width, c.height)
      return { data: Array.from(id.data), width: c.width, height: c.height }
    }, dataUrl)) as unknown as { data: number[]; width: number; height: number }

    // Otsu 자동 임계값 + 잉크 과다 시 자동 반전 (어두운 배경 도면 대응)
    const rgba = new Uint8ClampedArray(gray.data)
    const th = autoThresholdOtsu(rgba, gray.width, gray.height)
    let grayTyped: Gray = toGray(rgba, gray.width, gray.height, th)
    if (inkRatio(grayTyped) > 0.5) grayTyped = invertGray(grayTyped)
    console.log('DEBUG th:', th, 'inkRatio:', inkRatio(grayTyped).toFixed(3))

    const t0 = performance.now()
    const plan = buildPlanFromImage(grayTyped, {
      threshold: th,
      useOtsuFromRgba: undefined,
      minThicknessPx: 4,
      minLengthPx: 40,
      gapRangeMm: [500, 1400],
      exteriorWallMm: 200,
      minRoomAreaM2: 1.5,
      wallHeightMm: 2400,
      morphCloseRadius: 2,
      denoiseMinComponentPx: 300,
      orthoToleranceMm: 80,
    })
    const ms = Math.round(performance.now() - t0)

    const largest = plan.rooms.reduce((a, r) => Math.max(a, r.areaM2), 0)
    const row: Row = {
      image: file,
      px: `${grayTyped.width}x${grayTyped.height}`,
      ms,
      walls: plan.walls.length,
      rooms: plan.rooms.length,
      openings: plan.openings.length,
      mmPerPx: Math.round(plan.mmPerPx * 10) / 10,
      largestRoomM2: Math.round(largest * 10) / 10,
    }
    console.log('BENCH ' + JSON.stringify(row))

    // 최소 품질 단정 — 실도면은 스타일 편차가 커서 느슨하게
    expect(row.walls).toBeGreaterThanOrEqual(3)
    expect(row.rooms).toBeGreaterThanOrEqual(1)
    expect(row.ms).toBeLessThan(5000)
    expect(row.mmPerPx).toBeGreaterThan(0)
  })
}

test('벤치마크 리포트 저장', async () => {
  void IMAGES
  // 리포트는 각 테스트의 BENCH 라인을 CI 로그에서 수집하며,
  // 마지막으로 요약 파일도 기록 (다음 개선 사이클 비교용)
  const summaryPath = 'e2e/fixtures/cv-benchmark-latest.json'
  if (existsSync(summaryPath)) console.log('이전 리포트 존재 — 비교 가능')
  writeFileSync(summaryPath, JSON.stringify({ note: 'BENCH 라인은 콘솔 참조', at: new Date().toISOString() }, null, 2))
})
