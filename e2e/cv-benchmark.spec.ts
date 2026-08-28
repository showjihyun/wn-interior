// 실도면 CV 벤치마크 — 로컬 fixture를 planVision 파이프라인으로 일괄 변환·평가
// LLM/네트워크 불필요. 기준선은 fixtures, 매 실행 결과는 test-results에 기록한다.
import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { createHash } from 'node:crypto'
import {
  buildPlanFromImage,
  autoThresholdOtsu,
  toGray,
  invertGray,
  inkRatio,
  rescalePlanToWidth,
} from '../src/engine/planVision'
import type { Gray } from '../src/engine/planVision'

const FIXTURES = 'e2e/fixtures'
const BASELINE = JSON.parse(
  readFileSync(`${FIXTURES}/cv-benchmark-baseline.json`, 'utf8')
) as BenchmarkBaseline
const RESULTS = new Map<string, Row>()
const WIKIMEDIA = JSON.parse(
  readFileSync(`${FIXTURES}/wikimedia-floorplans.json`, 'utf8')
) as WikimediaManifest

interface BenchmarkCase {
  source: string
  minWalls: number
  minRooms: number
  minOpenings: number
  maxMs: number
  knownWidthMm?: number
  expectedConversion?: boolean
}

interface BenchmarkBaseline {
  minimumConversionSuccessRate: number
  cases: Record<string, BenchmarkCase>
}

interface WikimediaManifest {
  cases: Array<{
    file: string
    sourcePage: string
    license: string
    sha256: string
  }>
}

interface Row {
  image: string
  px: string
  threshold: number
  inkRatio: number
  ms: number
  walls: number
  rooms: number
  openings: number
  rawMmPerPx: number
  mmPerPx: number
  largestRoomM2: number
  rawDetectedWidthMm: number
  detectedWidthMm: number
  knownWidthMm?: number
  rawScaleErrorPct?: number
  scaleErrorPct?: number
  conversionSuccess: boolean
  expectedConversion: boolean
}

test.describe.configure({ mode: 'serial' })

test('Wikimedia 실도면 fixture의 출처·라이선스·해시가 고정돼 있다', () => {
  expect(WIKIMEDIA.cases).toHaveLength(8)
  for (const fixture of WIKIMEDIA.cases) {
    expect(fixture.license).toMatch(/^(Public domain|CC0|CC BY(?:-SA)?)/)
    expect(BASELINE.cases[fixture.file]?.source).toBe(fixture.sourcePage)
    const digest = createHash('sha256')
      .update(readFileSync(`${FIXTURES}/${fixture.file}`))
      .digest('hex')
    expect(digest).toBe(fixture.sha256)
  }
})

for (const [file, baseline] of Object.entries(BASELINE.cases)) {
  test(`CV 변환: ${file}`, async ({ page }) => {
    test.setTimeout(60_000)
    const buf = readFileSync(`${FIXTURES}/${file}`)
    const dataUrl = `data:image/${file.endsWith('.png') ? 'png' : 'jpeg'};base64,${buf.toString('base64')}`
    await page.goto('about:blank')

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

    const rgba = new Uint8ClampedArray(gray.data)
    const threshold = autoThresholdOtsu(rgba, gray.width, gray.height)
    let grayTyped: Gray = toGray(rgba, gray.width, gray.height, threshold)
    if (inkRatio(grayTyped) > 0.5) grayTyped = invertGray(grayTyped)
    const normalizedInkRatio = inkRatio(grayTyped)

    const t0 = performance.now()
    const rawPlan = buildPlanFromImage(grayTyped, {
      threshold,
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
    const rawXs = rawPlan.walls.flatMap((wall) => [wall.a.x, wall.b.x])
    const rawDetectedWidthMm = rawXs.length
      ? Math.round(Math.max(...rawXs) - Math.min(...rawXs))
      : 0
    const plan = baseline.knownWidthMm
      ? rescalePlanToWidth(rawPlan, baseline.knownWidthMm)
      : rawPlan
    const ms = Math.round(performance.now() - t0)

    const xs = plan.walls.flatMap((wall) => [wall.a.x, wall.b.x])
    const detectedWidthMm = xs.length ? Math.round(Math.max(...xs) - Math.min(...xs)) : 0
    const largest = plan.rooms.reduce((area, room) => Math.max(area, room.areaM2), 0)
    const row: Row = {
      image: file,
      px: `${grayTyped.width}x${grayTyped.height}`,
      threshold,
      inkRatio: Math.round(normalizedInkRatio * 1000) / 1000,
      ms,
      walls: plan.walls.length,
      rooms: plan.rooms.length,
      openings: plan.openings.length,
      rawMmPerPx: Math.round(rawPlan.mmPerPx * 10) / 10,
      mmPerPx: Math.round(plan.mmPerPx * 10) / 10,
      largestRoomM2: Math.round(largest * 10) / 10,
      rawDetectedWidthMm,
      detectedWidthMm,
      knownWidthMm: baseline.knownWidthMm,
      rawScaleErrorPct: baseline.knownWidthMm
        ? Math.round(
            (Math.abs(rawDetectedWidthMm - baseline.knownWidthMm) / baseline.knownWidthMm) * 1000
          ) / 10
        : undefined,
      scaleErrorPct: baseline.knownWidthMm
        ? Math.round(
            (Math.abs(detectedWidthMm - baseline.knownWidthMm) / baseline.knownWidthMm) * 1000
          ) / 10
        : undefined,
      conversionSuccess: plan.walls.length > 0 && plan.rooms.length > 0,
      expectedConversion: baseline.expectedConversion !== false,
    }
    RESULTS.set(file, row)
    console.log('BENCH ' + JSON.stringify(row))

    expect(row.walls).toBeGreaterThanOrEqual(baseline.minWalls)
    expect(row.rooms).toBeGreaterThanOrEqual(baseline.minRooms)
    expect(row.openings).toBeGreaterThanOrEqual(baseline.minOpenings)
    expect(row.ms).toBeLessThan(baseline.maxMs)
    expect(row.mmPerPx).toBeGreaterThan(0)
    if (baseline.expectedConversion !== false) expect(row.conversionSuccess).toBe(true)
  })
}

test('10종 실도면의 구조 변환 성공률을 집계하고 리포트를 저장한다', async () => {
  expect(RESULTS.size).toBe(Object.keys(BASELINE.cases).length)
  const rows = [...RESULTS.values()]
  const successCount = rows.filter((row) => row.conversionSuccess).length
  const conversionSuccessRate = successCount / rows.length
  expect(conversionSuccessRate).toBeGreaterThanOrEqual(BASELINE.minimumConversionSuccessRate)
  console.log(
    `BENCH-SUMMARY ${JSON.stringify({ cases: rows.length, successCount, conversionSuccessRate })}`
  )
  mkdirSync('test-results', { recursive: true })
  writeFileSync(
    'test-results/cv-benchmark-latest.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        summary: { cases: rows.length, successCount, conversionSuccessRate },
        results: rows,
      },
      null,
      2
    )
  )
})
