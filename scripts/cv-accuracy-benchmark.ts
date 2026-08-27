import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import path from 'node:path'
import sharp from 'sharp'
import {
  autoThresholdOtsu,
  buildPlanFromImage,
  inkRatio,
  invertGray,
  rescalePlanToWidth,
  toGray,
  vectorizeOpeningMask,
  type Gray,
  type RawPlan,
} from '../src/engine/planVision'

const DATASET_ROOT = path.resolve(process.argv[2] ?? '../.datasets/cubicasa5k')
const EVIDENCE_DIR = path.resolve('docs/evidence')
const REAL_LIMIT = Number(process.env.CV_REAL_LIMIT ?? 1000)
const SYNTHETIC_COUNT = Number(process.env.CV_SYNTHETIC_COUNT ?? 1200)
const GRID = Number(process.env.CV_GRID ?? 128)
const OUTPUT_NAME = process.env.CV_OUTPUT_NAME ?? 'cv-accuracy-latest.json'
const DATA_SPLIT = process.env.CV_SPLIT ?? 'all'
const BINARIZATION = process.env.CV_BINARIZATION ?? 'luma'
const PROFILE = process.env.CV_PROFILE ?? 'fixed'
const MIN_THICKNESS = Number(process.env.CV_MIN_THICKNESS ?? 4)
const MIN_LENGTH = Number(process.env.CV_MIN_LENGTH ?? 40)
const MORPH_RADIUS = Number(process.env.CV_MORPH_RADIUS ?? 2)
const DENOISE_SIZE = Number(process.env.CV_DENOISE_SIZE ?? 300)
const MASK_ROOT = process.env.CV_MASK_ROOT ? path.resolve(process.env.CV_MASK_ROOT) : null
const DIRECT_OPENINGS = process.env.CV_DIRECT_OPENINGS === '1'

interface DatasetManifest {
  dataset: string
  doi: string
  license: string
  selection: string
  count: number
  cases: { category: string; id: string }[]
}

interface Polygon {
  points: { x: number; y: number }[]
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
}

interface RealRow {
  category: string
  id: string
  width: number
  height: number
  gtRooms: number
  predictedRooms: number
  gtWalls: number
  predictedWalls: number
  gtDoors: number
  predictedDoors: number
  predictedOpenings: number
  gtWindows: number
  predictedWindows: number
  conversionSucceeded: boolean
  roomCountExact: boolean
  roomCountWithinOne: boolean
  matchedRoomsAt50: number
  roomPrecisionAt50: number
  roomRecallAt50: number
  roomF1At50: number
  meanBestRoomIoU: number
  wallPrecision: number
  wallRecall: number
  wallF1: number
  doorCountAgreement: number
  windowCountAgreement: number
  doorLocationF1: number
  windowLocationF1: number
  elapsedMs: number
  error?: string
}

interface SyntheticRow {
  seed: number
  variant: string
  expectedRooms: number
  predictedRooms: number
  expectedOpenings: number
  predictedOpenings: number
  conversionSucceeded: boolean
  roomCountExact: boolean
  openingCountExact: boolean
  rawScaleErrorPct: number
  calibratedScaleErrorPct: number
  elapsedMs: number
}

const round = (value: number, digits = 4) => {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
}

function polygon(points: { x: number; y: number }[]): Polygon {
  return {
    points,
    bbox: {
      minX: Math.min(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxX: Math.max(...points.map((point) => point.x)),
      maxY: Math.max(...points.map((point) => point.y)),
    },
  }
}

function parsePoints(raw: string, scaleX: number, scaleY: number): Polygon {
  const values = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const points = []
  for (let i = 0; i + 1 < values.length; i += 2) {
    points.push({ x: values[i] * scaleX, y: values[i + 1] * scaleY })
  }
  return polygon(points)
}

function pointInPolygon(x: number, y: number, poly: Polygon): boolean {
  const { bbox, points } = poly
  if (x < bbox.minX || x > bbox.maxX || y < bbox.minY || y > bbox.maxY) return false
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function parseGroundTruth(
  svg: string,
  imageWidth: number,
  imageHeight: number,
  originalWidth: number,
  originalHeight: number
) {
  // CubiCasa 공식 House 로더는 SVG 좌표를 F1_scaled.png 원본 픽셀에 그대로
  // 래스터화한다. viewBox를 이미지 전체로 늘리면 여백이 큰 사례가 오정렬된다.
  const scaleX = imageWidth / originalWidth
  const scaleY = imageHeight / originalHeight
  const rooms: Polygon[] = []
  const walls: Polygon[] = []
  const doors: Polygon[] = []
  const windows: Polygon[] = []

  const roomRe = /<g\b[^>]*class="Space\s+([^"]+)"[^>]*>\s*<polygon\b[^>]*points="([^"]+)"/g
  for (const match of svg.matchAll(roomRe)) {
    const classes = match[1].split(/\s+/)
    if (classes.includes('Outdoor')) continue
    const parsed = parsePoints(match[2], scaleX, scaleY)
    if (parsed.points.length >= 3) rooms.push(parsed)
  }

  const wallRe = /<g\b[^>]*class="Wall(?:\s+[^"]*)?"[^>]*>\s*<polygon\b[^>]*points="([^"]+)"/g
  for (const match of svg.matchAll(wallRe)) {
    const parsed = parsePoints(match[1], scaleX, scaleY)
    if (parsed.points.length >= 3) walls.push(parsed)
  }

  const openingPolygons = (openingType: 'Door' | 'Window') => {
    const result: Polygon[] = []
    const regex = new RegExp(
      `<g\\b[^>]*class="${openingType}(?:\\s+[^"]*)?"[^>]*>\\s*<polygon\\b[^>]*points="([^"]+)"`,
      'g'
    )
    for (const match of svg.matchAll(regex)) {
      const parsed = parsePoints(match[1], scaleX, scaleY)
      if (parsed.points.length >= 3) result.push(parsed)
    }
    return result
  }
  doors.push(...openingPolygons('Door'))
  windows.push(...openingPolygons('Window'))

  return {
    rooms,
    walls,
    doors,
    windows,
  }
}

function predictedRoomPolygons(plan: RawPlan): Polygon[] {
  return plan.rooms.map((room) =>
    polygon(room.polygon.map((point) => ({ x: point.x / plan.mmPerPx, y: point.y / plan.mmPerPx })))
  )
}

function colorAwareGray(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number
): Gray {
  if (BINARIZATION === 'luma') return toGray(rgba, width, height, threshold)
  const data = new Uint8Array(width * height)
  for (let index = 0, pixel = 0; index < data.length; index++, pixel += 4) {
    const r = rgba[pixel]
    const g = rgba[pixel + 1]
    const b = rgba[pixel + 2]
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const min = Math.min(r, g, b)
    const max = Math.max(r, g, b)
    const coloredLine = max - min >= 45 && min <= 190 && lum <= 245
    if (lum <= threshold || coloredLine) data[index] = 255
  }
  return { data, width, height }
}

function profileFor(width: number, height: number) {
  if (PROFILE !== 'adaptive') {
    return {
      minThicknessPx: MIN_THICKNESS,
      minLengthPx: MIN_LENGTH,
      morphCloseRadius: MORPH_RADIUS,
      denoiseMinComponentPx: DENOISE_SIZE,
    }
  }
  const shortSide = Math.min(width, height)
  const longSide = Math.max(width, height)
  return {
    minThicknessPx: Math.max(2, Math.min(5, Math.round(shortSide / 450))),
    minLengthPx: Math.max(20, Math.min(60, Math.round(longSide * 0.025))),
    morphCloseRadius: shortSide < 700 ? 1 : 2,
    denoiseMinComponentPx: Math.max(40, Math.min(300, Math.round(width * height * 0.00012))),
  }
}

function pointOnPredictedWall(x: number, y: number, plan: RawPlan): boolean {
  for (const wall of plan.walls) {
    const ax = wall.a.x / plan.mmPerPx
    const ay = wall.a.y / plan.mmPerPx
    const bx = wall.b.x / plan.mmPerPx
    const by = wall.b.y / plan.mmPerPx
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2))
    const distance = Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
    if (distance <= wall.thickness / plan.mmPerPx / 2) return true
  }
  return false
}

function scoreOpeningLocations(
  groundTruth: Polygon[],
  plan: RawPlan,
  type: 'door' | 'window'
): number {
  const predicted = plan.openings
    .filter((opening) => opening.type === type)
    .map((opening) => ({
      x: opening.at.x / plan.mmPerPx,
      y: opening.at.y / plan.mmPerPx,
      span: opening.width / plan.mmPerPx,
    }))
  const truth = groundTruth.map(({ bbox }) => ({
    x: (bbox.minX + bbox.maxX) / 2,
    y: (bbox.minY + bbox.maxY) / 2,
    span: Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY),
  }))
  const pairs: { gt: number; pred: number; distance: number }[] = []
  truth.forEach((gt, gtIndex) =>
    predicted.forEach((pred, predIndex) => {
      const distance = Math.hypot(gt.x - pred.x, gt.y - pred.y)
      const tolerance = Math.max(12, (gt.span + pred.span) / 2)
      if (distance <= tolerance) pairs.push({ gt: gtIndex, pred: predIndex, distance })
    })
  )
  pairs.sort((a, b) => a.distance - b.distance)
  const usedGt = new Set<number>()
  const usedPred = new Set<number>()
  let matched = 0
  for (const pair of pairs) {
    if (usedGt.has(pair.gt) || usedPred.has(pair.pred)) continue
    usedGt.add(pair.gt)
    usedPred.add(pair.pred)
    matched++
  }
  const precision = predicted.length ? matched / predicted.length : 0
  const recall = truth.length ? matched / truth.length : 0
  if (!truth.length && !predicted.length) return 1
  return precision + recall ? (2 * precision * recall) / (precision + recall) : 0
}

function scoreGeometry(
  gtRooms: Polygon[],
  gtWalls: Polygon[],
  plan: RawPlan,
  width: number,
  height: number
) {
  const predictedRooms = predictedRoomPolygons(plan)
  const gtArea = new Int32Array(gtRooms.length)
  const predArea = new Int32Array(predictedRooms.length)
  const intersections = new Map<string, number>()
  let gtWallArea = 0
  let predWallArea = 0
  let wallIntersection = 0

  for (let gy = 0; gy < GRID; gy++) {
    const y = ((gy + 0.5) / GRID) * height
    for (let gx = 0; gx < GRID; gx++) {
      const x = ((gx + 0.5) / GRID) * width
      const gtRoom = gtRooms.findIndex((room) => pointInPolygon(x, y, room))
      const predRoom = predictedRooms.findIndex((room) => pointInPolygon(x, y, room))
      if (gtRoom >= 0) gtArea[gtRoom]++
      if (predRoom >= 0) predArea[predRoom]++
      if (gtRoom >= 0 && predRoom >= 0) {
        const key = `${gtRoom}:${predRoom}`
        intersections.set(key, (intersections.get(key) ?? 0) + 1)
      }

      const onGtWall = gtWalls.some((wall) => pointInPolygon(x, y, wall))
      const onPredWall = pointOnPredictedWall(x, y, plan)
      if (onGtWall) gtWallArea++
      if (onPredWall) predWallArea++
      if (onGtWall && onPredWall) wallIntersection++
    }
  }

  const pairs = [...intersections.entries()]
    .map(([key, intersection]) => {
      const [gt, pred] = key.split(':').map(Number)
      const union = gtArea[gt] + predArea[pred] - intersection
      return { gt, pred, iou: union ? intersection / union : 0 }
    })
    .sort((a, b) => b.iou - a.iou)
  const usedGt = new Set<number>()
  const usedPred = new Set<number>()
  const matched = []
  for (const pair of pairs) {
    if (usedGt.has(pair.gt) || usedPred.has(pair.pred)) continue
    usedGt.add(pair.gt)
    usedPred.add(pair.pred)
    matched.push(pair)
  }
  const matchedAt50 = matched.filter((pair) => pair.iou >= 0.5).length
  const roomPrecision = predictedRooms.length ? matchedAt50 / predictedRooms.length : 0
  const roomRecall = gtRooms.length ? matchedAt50 / gtRooms.length : 0
  const roomF1 =
    roomPrecision + roomRecall ? (2 * roomPrecision * roomRecall) / (roomPrecision + roomRecall) : 0
  const wallPrecision = predWallArea ? wallIntersection / predWallArea : 0
  const wallRecall = gtWallArea ? wallIntersection / gtWallArea : 0
  const wallF1 =
    wallPrecision + wallRecall ? (2 * wallPrecision * wallRecall) / (wallPrecision + wallRecall) : 0
  const bestIoUs = gtRooms.map((_, gt) =>
    Math.max(0, ...pairs.filter((pair) => pair.gt === gt).map((pair) => pair.iou))
  )

  return {
    matchedAt50,
    roomPrecision,
    roomRecall,
    roomF1,
    meanBestRoomIoU: mean(bestIoUs),
    wallPrecision,
    wallRecall,
    wallF1,
  }
}

async function benchmarkReal(manifest: DatasetManifest): Promise<RealRow[]> {
  const rows: RealRow[] = []
  const splitCases = manifest.cases.filter((_, index) => {
    if (DATA_SPLIT === 'dev') return index % 10 === 0
    if (DATA_SPLIT === 'holdout') return index % 10 !== 0
    return true
  })
  const selected =
    REAL_LIMIT >= splitCases.length
      ? splitCases.slice(0, REAL_LIMIT)
      : Array.from(
          { length: REAL_LIMIT },
          (_, index) => splitCases[Math.round((index * (splitCases.length - 1)) / (REAL_LIMIT - 1))]
        )
  for (let index = 0; index < selected.length; index++) {
    const item = selected[index]
    const caseDir = path.join(DATASET_ROOT, 'samples', item.category, item.id)
    const started = performance.now()
    try {
      const imagePath = path.join(caseDir, 'F1_scaled.png')
      const metadata = await sharp(imagePath).metadata()
      const originalWidth = metadata.width ?? 0
      const originalHeight = metadata.height ?? 0
      if (!originalWidth || !originalHeight) throw new Error('원본 이미지 크기를 읽을 수 없음')
      const rasterPath = MASK_ROOT
        ? path.join(MASK_ROOT, item.category, `${item.id}.png`)
        : imagePath
      const [{ data, info }, svg] = await Promise.all([
        MASK_ROOT
          ? sharp(rasterPath).greyscale().raw().toBuffer({ resolveWithObject: true })
          : sharp(rasterPath)
              .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true }),
        readFile(path.join(caseDir, 'model.svg'), 'utf8'),
      ])
      let threshold = 128
      let gray: Gray
      if (MASK_ROOT) {
        gray = {
          data: Uint8Array.from(data, (value) => (value >= 128 ? 255 : 0)),
          width: info.width,
          height: info.height,
        }
      } else {
        const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
        threshold = autoThresholdOtsu(rgba, info.width, info.height)
        gray = colorAwareGray(rgba, info.width, info.height, threshold)
        if (inkRatio(gray) > 0.5) gray = invertGray(gray)
      }
      const profile = profileFor(info.width, info.height)
      let plan = buildPlanFromImage(gray, {
        threshold,
        minThicknessPx: profile.minThicknessPx,
        minLengthPx: profile.minLengthPx,
        gapRangeMm: [500, 1400],
        exteriorWallMm: 200,
        minRoomAreaM2: 1.5,
        wallHeightMm: 2400,
        morphCloseRadius: profile.morphCloseRadius,
        denoiseMinComponentPx: profile.denoiseMinComponentPx,
        orthoToleranceMm: 80,
      })
      if (MASK_ROOT && DIRECT_OPENINGS) {
        const readOpeningMask = async (suffix: string): Promise<Gray> => {
          const result = await sharp(
            path.join(MASK_ROOT, item.category, `${item.id}-${suffix}.png`)
          )
            .greyscale()
            .raw()
            .toBuffer({ resolveWithObject: true })
          return {
            data: Uint8Array.from(result.data, (value) => (value >= 128 ? 255 : 0)),
            width: result.info.width,
            height: result.info.height,
          }
        }
        const [doorMask, windowMask] = await Promise.all([
          readOpeningMask('doors'),
          readOpeningMask('windows'),
        ])
        const doors = vectorizeOpeningMask(doorMask, plan.walls, plan.mmPerPx, 'door')
        const windows = vectorizeOpeningMask(windowMask, plan.walls, plan.mmPerPx, 'window')
        plan = { ...plan, openings: [...doors, ...windows] }
      }
      const gt = parseGroundTruth(svg, info.width, info.height, originalWidth, originalHeight)
      const geometry = scoreGeometry(gt.rooms, gt.walls, plan, info.width, info.height)
      const predictedDoors = plan.openings.filter((opening) => opening.type === 'door').length
      const predictedWindows = plan.openings.filter((opening) => opening.type === 'window').length
      const countAgreement = (expected: number, predicted: number) =>
        expected
          ? Math.min(expected, predicted) / Math.max(expected, predicted)
          : predicted === 0
            ? 1
            : 0
      const doorCountAgreement = countAgreement(gt.doors.length, predictedDoors)
      const windowCountAgreement = countAgreement(gt.windows.length, predictedWindows)
      const doorLocationF1 = scoreOpeningLocations(gt.doors, plan, 'door')
      const windowLocationF1 = scoreOpeningLocations(gt.windows, plan, 'window')
      const conversionSucceeded =
        plan.walls.length > 0 &&
        plan.rooms.length > 0 &&
        plan.walls.every((wall) =>
          [wall.a.x, wall.a.y, wall.b.x, wall.b.y, wall.thickness].every(Number.isFinite)
        )
      rows.push({
        category: item.category,
        id: item.id,
        width: info.width,
        height: info.height,
        gtRooms: gt.rooms.length,
        predictedRooms: plan.rooms.length,
        gtWalls: gt.walls.length,
        predictedWalls: plan.walls.length,
        gtDoors: gt.doors.length,
        predictedDoors,
        predictedOpenings: plan.openings.length,
        gtWindows: gt.windows.length,
        predictedWindows,
        conversionSucceeded,
        roomCountExact: plan.rooms.length === gt.rooms.length,
        roomCountWithinOne: Math.abs(plan.rooms.length - gt.rooms.length) <= 1,
        matchedRoomsAt50: geometry.matchedAt50,
        roomPrecisionAt50: round(geometry.roomPrecision),
        roomRecallAt50: round(geometry.roomRecall),
        roomF1At50: round(geometry.roomF1),
        meanBestRoomIoU: round(geometry.meanBestRoomIoU),
        wallPrecision: round(geometry.wallPrecision),
        wallRecall: round(geometry.wallRecall),
        wallF1: round(geometry.wallF1),
        doorCountAgreement: round(doorCountAgreement),
        windowCountAgreement: round(windowCountAgreement),
        doorLocationF1: round(doorLocationF1),
        windowLocationF1: round(windowLocationF1),
        elapsedMs: round(performance.now() - started, 1),
      })
    } catch (error) {
      rows.push({
        category: item.category,
        id: item.id,
        width: 0,
        height: 0,
        gtRooms: 0,
        predictedRooms: 0,
        gtWalls: 0,
        predictedWalls: 0,
        gtDoors: 0,
        predictedDoors: 0,
        predictedOpenings: 0,
        gtWindows: 0,
        predictedWindows: 0,
        conversionSucceeded: false,
        roomCountExact: false,
        roomCountWithinOne: false,
        matchedRoomsAt50: 0,
        roomPrecisionAt50: 0,
        roomRecallAt50: 0,
        roomF1At50: 0,
        meanBestRoomIoU: 0,
        wallPrecision: 0,
        wallRecall: 0,
        wallF1: 0,
        doorCountAgreement: 0,
        windowCountAgreement: 0,
        doorLocationF1: 0,
        windowLocationF1: 0,
        elapsedMs: round(performance.now() - started, 1),
        error: error instanceof Error ? error.message : String(error),
      })
    }
    if ((index + 1) % 25 === 0) console.log(`real: ${index + 1}/${selected.length}`)
  }
  return rows
}

function rng(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function syntheticCase(seed: number, variant: string) {
  const random = rng(seed)
  const width = 520 + Math.floor(random() * 281)
  const height = 420 + Math.floor(random() * 241)
  const margin = 30 + Math.floor(random() * 21)
  const columns = 2 + Math.floor(random() * 3)
  const rows = 2 + Math.floor(random() * 3)
  const exteriorThickness = 7 + Math.floor(random() * 7)
  const interiorThickness = Math.max(4, Math.round(exteriorThickness * 0.7))
  const trueMmPerPx = 20 + random() * 10
  const gapPx = Math.max(10, Math.round(900 / trueMmPerPx))
  const data = new Uint8Array(width * height)
  const set = (x: number, y: number, value = 255) => {
    if (x >= 0 && x < width && y >= 0 && y < height) data[y * width + x] = value
  }
  const rect = (x1: number, y1: number, x2: number, y2: number, thickness: number) => {
    const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1)
    if (horizontal) {
      for (let y = Math.round(y1 - thickness / 2); y <= Math.round(y1 + thickness / 2); y++)
        for (let x = Math.round(Math.min(x1, x2)); x <= Math.round(Math.max(x1, x2)); x++) set(x, y)
    } else {
      for (let x = Math.round(x1 - thickness / 2); x <= Math.round(x1 + thickness / 2); x++)
        for (let y = Math.round(Math.min(y1, y2)); y <= Math.round(Math.max(y1, y2)); y++) set(x, y)
    }
  }

  const left = margin
  const right = width - margin
  const top = margin
  const bottom = height - margin
  rect(left, top, right, top, exteriorThickness)
  rect(left, bottom, right, bottom, exteriorThickness)
  rect(left, top, left, bottom, exteriorThickness)
  rect(right, top, right, bottom, exteriorThickness)
  let expectedOpenings = 0
  for (let col = 1; col < columns; col++) {
    const x = left + ((right - left) * col) / columns
    const center = top + (bottom - top) * (0.3 + random() * 0.4)
    rect(x, top, x, center - gapPx / 2, interiorThickness)
    rect(x, center + gapPx / 2, x, bottom, interiorThickness)
    expectedOpenings++
  }
  for (let row = 1; row < rows; row++) {
    const y = top + ((bottom - top) * row) / rows
    const center = left + (right - left) * (0.3 + random() * 0.4)
    rect(left, y, center - gapPx / 2, y, interiorThickness)
    rect(center + gapPx / 2, y, right, y, interiorThickness)
    expectedOpenings++
  }

  if (variant === 'noise' || variant === 'mixed') {
    for (let i = 0; i < 120; i++) {
      const x = Math.floor(random() * width)
      const y = Math.floor(random() * height)
      const size = 1 + Math.floor(random() * 3)
      for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) set(x + xx, y + yy)
    }
  }
  if (variant === 'cracks' || variant === 'mixed') {
    for (let i = 0; i < 8; i++) {
      const x = left + Math.floor(random() * (right - left))
      for (let dx = -1; dx <= 1; dx++)
        for (
          let y = Math.round(top - exteriorThickness / 2);
          y <= Math.round(top + exteriorThickness / 2);
          y++
        )
          set(x + dx, y, 0)
    }
  }
  let gray: Gray = { data, width, height }
  if (variant === 'inverted') gray = invertGray(gray)
  if (inkRatio(gray) > 0.5) gray = invertGray(gray)
  return {
    gray,
    expectedRooms: rows * columns,
    expectedOpenings,
    trueMmPerPx,
    knownWidthMm: (right - left) * trueMmPerPx,
    exteriorWallMm: exteriorThickness * trueMmPerPx,
  }
}

function benchmarkSynthetic(): SyntheticRow[] {
  const variants = ['clean', 'noise', 'cracks', 'inverted', 'mixed']
  const rows: SyntheticRow[] = []
  for (let index = 0; index < SYNTHETIC_COUNT; index++) {
    const seed = 20260827 + index
    const variant = variants[index % variants.length]
    const sample = syntheticCase(seed, variant)
    const started = performance.now()
    const plan = buildPlanFromImage(sample.gray, {
      threshold: 128,
      minThicknessPx: 4,
      minLengthPx: 40,
      gapRangeMm: [500, 1400],
      exteriorWallMm: sample.exteriorWallMm,
      minRoomAreaM2: 1.5,
      wallHeightMm: 2400,
      morphCloseRadius: 2,
      denoiseMinComponentPx: 300,
      orthoToleranceMm: 80,
    })
    const calibrated = rescalePlanToWidth(plan, sample.knownWidthMm)
    rows.push({
      seed,
      variant,
      expectedRooms: sample.expectedRooms,
      predictedRooms: plan.rooms.length,
      expectedOpenings: sample.expectedOpenings,
      predictedOpenings: plan.openings.length,
      conversionSucceeded: plan.walls.length > 0 && plan.rooms.length > 0,
      roomCountExact: plan.rooms.length === sample.expectedRooms,
      openingCountExact: plan.openings.length === sample.expectedOpenings,
      rawScaleErrorPct: round(
        (Math.abs(plan.mmPerPx - sample.trueMmPerPx) / sample.trueMmPerPx) * 100
      ),
      calibratedScaleErrorPct: round(
        (Math.abs(calibrated.mmPerPx - sample.trueMmPerPx) / sample.trueMmPerPx) * 100
      ),
      elapsedMs: round(performance.now() - started, 1),
    })
    if ((index + 1) % 100 === 0) console.log(`synthetic: ${index + 1}/${SYNTHETIC_COUNT}`)
  }
  return rows
}

function summarizeReal(rows: RealRow[]) {
  const group = (items: RealRow[]) => ({
    count: items.length,
    conversionSuccessRate: round(mean(items.map((row) => (row.conversionSucceeded ? 1 : 0)))),
    roomCountExactRate: round(mean(items.map((row) => (row.roomCountExact ? 1 : 0)))),
    roomCountWithinOneRate: round(mean(items.map((row) => (row.roomCountWithinOne ? 1 : 0)))),
    meanRoomF1At50: round(mean(items.map((row) => row.roomF1At50))),
    medianRoomF1At50: round(
      percentile(
        items.map((row) => row.roomF1At50),
        0.5
      )
    ),
    p10RoomF1At50: round(
      percentile(
        items.map((row) => row.roomF1At50),
        0.1
      )
    ),
    meanBestRoomIoU: round(mean(items.map((row) => row.meanBestRoomIoU))),
    meanWallF1: round(mean(items.map((row) => row.wallF1))),
    medianWallF1: round(
      percentile(
        items.map((row) => row.wallF1),
        0.5
      )
    ),
    meanDoorCountAgreement: round(mean(items.map((row) => row.doorCountAgreement))),
    meanWindowCountAgreement: round(mean(items.map((row) => row.windowCountAgreement))),
    meanDoorLocationF1: round(mean(items.map((row) => row.doorLocationF1))),
    meanWindowLocationF1: round(mean(items.map((row) => row.windowLocationF1))),
    meanElapsedMs: round(mean(items.map((row) => row.elapsedMs)), 1),
    p95ElapsedMs: round(
      percentile(
        items.map((row) => row.elapsedMs),
        0.95
      ),
      1
    ),
  })
  const categories = Object.fromEntries(
    [...new Set(rows.map((row) => row.category))].map((category) => [
      category,
      group(rows.filter((row) => row.category === category)),
    ])
  )
  return { overall: group(rows), categories }
}

function summarizeSynthetic(rows: SyntheticRow[]) {
  const group = (items: SyntheticRow[]) => ({
    count: items.length,
    conversionSuccessRate: round(mean(items.map((row) => (row.conversionSucceeded ? 1 : 0)))),
    roomCountExactRate: round(mean(items.map((row) => (row.roomCountExact ? 1 : 0)))),
    openingCountExactRate: round(mean(items.map((row) => (row.openingCountExact ? 1 : 0)))),
    meanRawScaleErrorPct: round(mean(items.map((row) => row.rawScaleErrorPct)), 2),
    p95RawScaleErrorPct: round(
      percentile(
        items.map((row) => row.rawScaleErrorPct),
        0.95
      ),
      2
    ),
    meanCalibratedScaleErrorPct: round(mean(items.map((row) => row.calibratedScaleErrorPct)), 2),
    meanElapsedMs: round(mean(items.map((row) => row.elapsedMs)), 1),
  })
  const variants = Object.fromEntries(
    [...new Set(rows.map((row) => row.variant))].map((variant) => [
      variant,
      group(rows.filter((row) => row.variant === variant)),
    ])
  )
  return { overall: group(rows), variants }
}

async function main() {
  const manifestPath = path.join(DATASET_ROOT, 'sample-manifest.json')
  const manifestRaw = await readFile(manifestPath)
  const manifest = JSON.parse(manifestRaw.toString('utf8')) as DatasetManifest
  if (manifest.count < REAL_LIMIT)
    throw new Error(`실도면 표본 부족: ${manifest.count}/${REAL_LIMIT}`)
  const started = performance.now()
  console.log(`실도면 ${REAL_LIMIT}건 + 합성 ${SYNTHETIC_COUNT}건 정확도 감사 시작`)
  const syntheticRows = benchmarkSynthetic()
  const realRows = await benchmarkReal(manifest)
  const realSummary = summarizeReal(realRows)
  const syntheticSummary = summarizeSynthetic(syntheticRows)
  const failures = [...realRows]
    .sort((a, b) => a.roomF1At50 + a.wallF1 - (b.roomF1At50 + b.wallF1))
    .slice(0, 25)
  const successes = [...realRows]
    .sort((a, b) => b.roomF1At50 + b.wallF1 - (a.roomF1At50 + a.wallF1))
    .slice(0, 10)
  const evidence = {
    generatedAt: new Date().toISOString(),
    engine: 'src/engine/planVision.ts',
    methodologyVersion: 1,
    parameters: {
      dataSplit: DATA_SPLIT,
      grid: GRID,
      binarization: BINARIZATION,
      profile: PROFILE,
      minThickness: MIN_THICKNESS,
      minLength: MIN_LENGTH,
      morphRadius: MORPH_RADIUS,
      denoiseSize: DENOISE_SIZE,
      maskRoot: MASK_ROOT,
      directOpenings: DIRECT_OPENINGS,
    },
    totalCases: realRows.length + syntheticRows.length,
    real: {
      dataset: manifest.dataset,
      doi: manifest.doi,
      license: manifest.license,
      selection: manifest.selection,
      manifestSha256: createHash('sha256').update(manifestRaw).digest('hex'),
      gridResolution: GRID,
      summary: realSummary,
      failures,
      successes,
      rows: realRows,
    },
    synthetic: {
      seedStart: 20260827,
      summary: syntheticSummary,
      rows: syntheticRows,
    },
    elapsedSeconds: round((performance.now() - started) / 1000, 1),
  }
  await mkdir(EVIDENCE_DIR, { recursive: true })
  await writeFile(path.join(EVIDENCE_DIR, OUTPUT_NAME), JSON.stringify(evidence, null, 2), 'utf8')
  console.log(
    JSON.stringify({ totalCases: evidence.totalCases, realSummary, syntheticSummary }, null, 2)
  )
  console.log(`근거 저장: ${path.join(EVIDENCE_DIR, OUTPUT_NAME)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
