// ─────────────────────────────────────────────────────────────
// CV 도면 변환 엔진 — LLM 없이 고전 이미지 처리로 2D 도면 → FloorPlan
// 파이프라인: 이진화 → H/V 런-밴드 벽 추출(두꺼운 선만) → 갭→문 검출
//           → 축척 추정(외벽 두께 기준) → 플러드필 방지 폴리곤 + RDP 단순화
// 모든 함수는 canvas 없이 순수 배열(Gray)로 동작 — 단위테스트 가능
// ─────────────────────────────────────────────────────────────
import type { Pt } from '../types'

export interface Gray {
  data: Uint8Array // 255=잉크(어두운 선), 0=배경
  width: number
  height: number
}

/** RGBA ImageData → 이진 Gray (luminance < threshold → 잉크) */
export function toGray(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number
): Gray {
  const data = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
    if (lum <= threshold) data[i] = 255
  }
  return { data, width, height }
}

// ── 벽 세그먼트 ──
export interface WallSeg {
  x1: number
  y1: number
  x2: number
  y2: number
  thickness: number // px (밴드 두께)
  /** 밴드 내부 갭(문 후보): 갭 시작 px 좌표와 길이 */
  openingAfter?: { at: number; gapPx: number }
}

export interface FindWallOpts {
  minThicknessPx: number
  minLengthPx: number
}

interface Band {
  pos1: number // H: yStart / V: xStart
  pos2: number // H: yEnd(포함) / V: xEnd
  start: number // H: x1 / V: y1
  end: number // H: x2 / V: y2
}

const overlap = (a1: number, a2: number, b1: number, b2: number) =>
  Math.min(a2, b2) - Math.max(a1, b1)

/** 한 방향(H: 가로 밴드 / V: 세로 밴드) 런-밴드 추출 + 솔리드 런 분해 + 갭 검출 */
function findBands(
  g: Gray,
  vertical: boolean,
  opts: FindWallOpts
): { segs: WallSeg[]; openings: { seg: WallSeg; at: number; gapPx: number }[] } {
  const { data, width, height } = g
  const main = vertical ? width : height // 스캔 라인 수
  const cross = vertical ? height : width // 라인 길이
  const inkAt = (m: number, c: number) => data[vertical ? c * width + m : m * width + c] > 0

  const minLen = opts.minLengthPx
  const gapMin = 6 // 노이즈 컷
  const segs: WallSeg[] = []
  const openings: { seg: WallSeg; at: number; gapPx: number }[] = []

  // 1) 행(라인)별 잉크 런 → 연속 행 병합해 밴드 생성
  interface OpenBand extends Band {
    rows: number
  }
  let open: OpenBand[] = []
  const closed: Band[] = []
  const closeBand = (b: OpenBand) => {
    if (b.rows >= opts.minThicknessPx)
      closed.push({ pos1: b.pos1, pos2: b.pos2, start: b.start, end: b.end })
  }
  for (let m = 0; m < main; m++) {
    // 이 라인의 잉크 런 (minLen 이상)
    const runs: [number, number][] = []
    let s = -1
    for (let c = 0; c < cross; c++) {
      if (inkAt(m, c)) {
        if (s < 0) s = c
      } else if (s >= 0) {
        if (c - s >= minLen) runs.push([s, c - 1])
        s = -1
      }
    }
    if (s >= 0 && cross - s >= minLen) runs.push([s, cross - 1])

    // 오픈 밴드와 런 매칭 (교집합 60% 이상)
    const next: OpenBand[] = []
    for (const r of runs) {
      const hit = open.find(
        (b) => overlap(b.start, b.end, r[0], r[1]) >= 0.6 * Math.min(b.end - b.start, r[1] - r[0])
      )
      if (hit) {
        hit.start = Math.min(hit.start, r[0])
        hit.end = Math.max(hit.end, r[1])
        hit.pos2 = m
        hit.rows = m - hit.pos1 + 1
        next.push(hit)
      } else {
        next.push({ pos1: m, pos2: m, start: r[0], end: r[1], rows: 1 })
      }
    }
    for (const b of open) if (!next.includes(b)) closeBand(b)
    open = next
  }
  for (const b of open) closeBand(b)

  // 2) 밴드 → 솔리드 컬럼 런 분해 (갭 = 문 후보)
  for (const b of closed) {
    const th = b.pos2 - b.pos1 + 1
    const need = Math.ceil(th * 0.6)
    const solid: boolean[] = []
    for (let c = 0; c < cross; c++) {
      let n = 0
      for (let m = b.pos1; m <= b.pos2; m++) if (inkAt(m, c)) n++
      solid[c] = n >= need
    }
    const runs: [number, number][] = []
    let s = -1
    for (let c = 0; c < cross; c++) {
      if (solid[c]) {
        if (s < 0) s = c
      } else if (s >= 0) {
        runs.push([s, c - 1])
        s = -1
      }
    }
    if (s >= 0) runs.push([s, cross - 1])

    const center = (b.pos1 + b.pos2) / 2
    for (let i = 0; i < runs.length; i++) {
      const [a1, a2] = runs[i]
      if (a2 - a1 + 1 < minLen) continue
      const seg: WallSeg = vertical
        ? { x1: center, y1: a1, x2: center, y2: a2, thickness: th }
        : { x1: a1, y1: center, x2: a2, y2: center, thickness: th }
      segs.push(seg)
      // 다음 솔리드 런 사이 갭 → 문 후보
      const nxt = runs[i + 1]
      if (nxt) {
        const gapPx = nxt[0] - a2 - 1
        if (gapPx >= gapMin) {
          openings.push({ seg, at: a2 + 1, gapPx })
        }
      }
    }
  }
  return { segs, openings }
}

/** H/V 중복 제거(박스 IoU) 후 벽 목록 반환. opening은 벽에 귀속 */
export function findWalls(g: Gray, opts: FindWallOpts): WallSeg[] {
  const h = findBands(g, false, opts)
  const v = findBands(g, true, opts)
  const all: WallSeg[] = []
  const box = (w: WallSeg) =>
    w.y1 === w.y2
      ? { x1: w.x1, y1: w.y1 - w.thickness / 2, x2: w.x2, y2: w.y1 + w.thickness / 2 }
      : { x1: w.x1 - w.thickness / 2, y1: w.y1, x2: w.x1 + w.thickness / 2, y2: w.y2 }
  const iou = (a: WallSeg, b: WallSeg) => {
    const ba = box(a)
    const bb = box(b)
    const iw = overlap(ba.x1, ba.x2, bb.x1, bb.x2)
    const ih = overlap(ba.y1, ba.y2, bb.y1, bb.y2)
    if (iw <= 0 || ih <= 0) return 0
    const inter = iw * ih
    const areaA = (ba.x2 - ba.x1) * (ba.y2 - ba.y1)
    const areaB = (bb.x2 - bb.x1) * (bb.y2 - bb.y1)
    return inter / (areaA + areaB - inter)
  }
  const withOpenings = [
    ...h.segs.map((s) => ({ s, gap: h.openings.find((o) => o.seg === s) })),
    ...v.segs.map((s) => ({ s, gap: v.openings.find((o) => o.seg === s) })),
  ]
  for (const { s, gap } of withOpenings) {
    if (all.some((k) => iou(k, s) > 0.8)) continue // H/V 이중 검출 제거
    if (gap) s.openingAfter = { at: gap.at, gapPx: gap.gapPx }
    all.push(s)
  }
  return all
}

/** 최두꺼 벽 = 외벽이라 가정하고 mm/px 환산 */
export function estimateScale(walls: WallSeg[], exteriorWallMm: number): number {
  if (walls.length === 0) return 1
  const th = walls.map((w) => w.thickness).sort((a, b) => a - b)
  const p90 = th[Math.min(th.length - 1, Math.floor(th.length * 0.9))]
  return exteriorWallMm / Math.max(p90, 1)
}

// ── 방 검출 ──
export interface RoomOut {
  polygon: Pt[] // mm
  areaM2: number
}

/** Douglas-Peucker 폴리라인 단순화 */
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const ax = pts[a].x
    const ay = pts[a].y
    const bx = pts[b].x
    const by = pts[b].y
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    let maxD = -1
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i].x - dx * pts[i].y + bx * ay - by * ax) / len
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

export function detectRooms(
  gray: Gray,
  walls: WallSeg[],
  opts: { mmPerPx: number; minAreaM2: number; includeSourceInk?: boolean }
): RoomOut[] {
  const { width: W, height: H } = gray
  // 1) 벽 마스크 래스터화 (문 갭 포함 채움 → 방이 새지 않게)
  const wall = new Uint8Array(W * H)
  // 긴 직선 검출이 놓친 짧은 벽·기둥·ㄱ자 모서리는 전처리된 원본 잉크로
  // 보완할 수 있다. 다만 컬러/주석이 많은 도면에서는 방을 과분할할 수 있어
  // 호출부가 선분 전용 결과와 비교해 더 유용한 쪽을 선택한다.
  if (opts.includeSourceInk)
    for (let i = 0; i < gray.data.length; i++) if (gray.data[i]) wall[i] = 1
  const fillRect = (x1: number, y1: number, x2: number, y2: number) => {
    for (let y = Math.max(0, Math.floor(y1)); y <= Math.min(H - 1, Math.ceil(y2)); y++)
      for (let x = Math.max(0, Math.floor(x1)); x <= Math.min(W - 1, Math.ceil(x2)); x++)
        wall[y * W + x] = 1
  }
  for (const w of walls) {
    const t = w.thickness / 2
    if (w.y1 === w.y2) {
      fillRect(w.x1, w.y1 - t, w.x2, w.y1 + t)
      if (w.openingAfter)
        fillRect(w.openingAfter.at, w.y1 - t, w.openingAfter.at + w.openingAfter.gapPx, w.y1 + t)
    } else {
      fillRect(w.x1 - t, w.y1, w.x1 + t, w.y2)
      if (w.openingAfter)
        fillRect(w.x1 - t, w.openingAfter.at, w.x1 + t, w.openingAfter.at + w.openingAfter.gapPx)
    }
  }

  // 2) 테두리에서 플러드필(외부) → 남은 자유 영역 = 방
  const label = new Int32Array(W * H) // 0=미방문, 1=외부, 2..=방
  const queue = new Int32Array(W * H)
  let qs = 0
  let qe = 0
  const push = (i: number) => {
    if (!wall[i] && label[i] === 0) {
      label[i] = 1
      queue[qe++] = i
    }
  }
  for (let x = 0; x < W; x++) {
    push(x)
    push((H - 1) * W + x)
  }
  for (let y = 0; y < H; y++) {
    push(y * W)
    push(y * W + W - 1)
  }
  while (qs < qe) {
    const i = queue[qs++]
    const x = i % W
    const y = (i / W) | 0
    if (x > 0) push(i - 1)
    if (x < W - 1) push(i + 1)
    if (y > 0) push(i - W)
    if (y < H - 1) push(i + W)
  }

  // 3) 미방문 자유 영역 → 컴포넌트 라벨링
  let next = 2
  const comps: { id: number; cells: number[] }[] = []
  for (let i = 0; i < W * H; i++) {
    if (wall[i] || label[i] !== 0) continue
    const id = next++
    const cells: number[] = []
    qs = qe = 0
    label[i] = id
    queue[qe++] = i
    while (qs < qe) {
      const c = queue[qs++]
      cells.push(c)
      const x = c % W
      const y = (c / W) | 0
      const nb = [
        x > 0 ? c - 1 : -1,
        x < W - 1 ? c + 1 : -1,
        y > 0 ? c - W : -1,
        y < H - 1 ? c + W : -1,
      ]
      for (const n of nb) {
        if (n >= 0 && !wall[n] && label[n] === 0) {
          label[n] = id
          queue[qe++] = n
        }
      }
    }
    comps.push({ id, cells })
  }

  // 4) 면적 필터 → 경계 추적(Moore) → RDP → mm 폴리곤
  const minAreaPx = (opts.minAreaM2 * 1e6) / (opts.mmPerPx * opts.mmPerPx)
  const out: RoomOut[] = []
  for (const comp of comps) {
    if (comp.cells.length < minAreaPx) continue
    // 경계 픽셀(이웃 중 하나라도 비-방)
    const isRoom = (i: number) => label[i] === comp.id
    const boundary: number[] = []
    for (const c of comp.cells) {
      const x = c % W
      const y = (c / W) | 0
      if (
        x === 0 ||
        y === 0 ||
        x === W - 1 ||
        y === H - 1 ||
        !isRoom(c - 1) ||
        !isRoom(c + 1) ||
        !isRoom(c - W) ||
        !isRoom(c + W)
      )
        boundary.push(c)
    }
    if (boundary.length < 4) continue
    // 경계 픽셀 집합에서 시작점(최상단-좌측) 선택 후 Moore 추적
    const bset = new Set(boundary)
    let start = boundary[0]
    for (const c of boundary) if (c < start) start = c
    const pts: Pt[] = []
    let cur = start
    let dir = 0 // 진입 방향 인덱스 (8방향, 시계방향 탐색)
    const DX = [1, 1, 0, -1, -1, -1, 0, 1]
    const DY = [0, 1, 1, 1, 0, -1, -1, -1]
    const seen = new Set<number>()
    const maxSteps = boundary.length * 4 + 16
    for (let step = 0; step < maxSteps; step++) {
      pts.push({ x: cur % W, y: (cur / W) | 0 })
      seen.add(cur)
      let found = -1
      for (let k = 0; k < 8; k++) {
        const nd = (dir + 6 + k) % 8 // 직전 진입 방향 기준 시계 탐색
        const nx = (cur % W) + DX[nd]
        const ny = ((cur / W) | 0) + DY[nd]
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const ni = ny * W + nx
        if (bset.has(ni)) {
          found = ni
          dir = nd
          break
        }
      }
      if (found < 0) break
      if (found === start && pts.length > 2) break
      cur = found
    }
    if (pts.length < 4) continue
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    // 닫힌 링: 첫=끝 동일점을 앵커로 하는 열린 RDP는 전부 탈락하므로 절반 분할 처리
    const eps = Math.max(3, diag * 0.02)
    const half = Math.floor(pts.length / 2)
    const r1 = rdp(pts.slice(0, half + 1), eps)
    const r2 = rdp(pts.slice(half), eps)
    const simple = [...r1.slice(0, -1), ...r2.slice(0, -1)]
    const polygon = simple.map((p) => ({ x: p.x * opts.mmPerPx, y: p.y * opts.mmPerPx }))
    if (polygon.length < 3) continue
    out.push({ polygon, areaM2: (comp.cells.length * opts.mmPerPx * opts.mmPerPx) / 1e6 })
  }
  return out
}

export interface PlanVisionOpts {
  threshold: number
  useOtsuFromRgba?: Uint8ClampedArray
  morphCloseRadius?: number
  denoiseMinComponentPx?: number
  orthoToleranceMm?: number
  minThicknessPx: number
  minLengthPx: number
  gapRangeMm: [number, number]
  exteriorWallMm: number
  minRoomAreaM2: number
  wallHeightMm: number
}

export interface RawPlan {
  wallHeight: number
  walls: { a: Pt; b: Pt; thickness: number }[]
  openings: { type: 'door' | 'window'; at: Pt; width: number }[]
  rooms: { name: string; polygon: Pt[]; areaM2: number }[]
  mmPerPx: number
}

/** CNN door/window 의미 마스크의 연결요소를 가장 가까운 벽 위 Opening 후보로 변환한다. */
export function vectorizeOpeningMask(
  mask: Gray,
  walls: RawPlan['walls'],
  mmPerPx: number,
  type: 'door' | 'window'
): RawPlan['openings'] {
  if (!walls.length || !Number.isFinite(mmPerPx) || mmPerPx <= 0) return []
  const { width, height, data } = mask
  const visited = new Uint8Array(data.length)
  const queue = new Int32Array(data.length)
  const minComponentPx = Math.max(6, Math.round(width * height * 0.00001))
  const candidates: {
    opening: RawPlan['openings'][number]
    wallIndex: number
    distance: number
  }[] = []

  for (let start = 0; start < data.length; start++) {
    if (!data[start] || visited[start]) continue
    let head = 0
    let tail = 0
    let count = 0
    let sumX = 0
    let sumY = 0
    let minX = width
    let maxX = 0
    let minY = height
    let maxY = 0
    visited[start] = 1
    queue[tail++] = start
    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = (index / width) | 0
      count++
      sumX += x
      sumY += y
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const next = ny * width + nx
          if (data[next] && !visited[next]) {
            visited[next] = 1
            queue[tail++] = next
          }
        }
      }
    }
    if (count < minComponentPx) continue

    const point = { x: (sumX / count) * mmPerPx, y: (sumY / count) * mmPerPx }
    let best: { wallIndex: number; at: Pt; distance: number; horizontal: boolean } | undefined
    walls.forEach((wall, wallIndex) => {
      const dx = wall.b.x - wall.a.x
      const dy = wall.b.y - wall.a.y
      const length2 = dx * dx + dy * dy || 1
      const t = Math.max(
        0,
        Math.min(1, ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / length2)
      )
      const at = { x: wall.a.x + dx * t, y: wall.a.y + dy * t }
      const distance = Math.hypot(point.x - at.x, point.y - at.y)
      if (!best || distance < best.distance) {
        best = { wallIndex, at, distance, horizontal: Math.abs(dx) >= Math.abs(dy) }
      }
    })
    if (!best || best.distance > Math.max(800, mmPerPx * 48)) continue
    const spanPx = best.horizontal ? maxX - minX + 1 : maxY - minY + 1
    const rawWidth = spanPx * mmPerPx
    const openingWidth =
      type === 'door'
        ? Math.max(500, Math.min(2200, rawWidth))
        : Math.max(400, Math.min(5000, rawWidth))
    candidates.push({
      opening: { type, at: best.at, width: openingWidth },
      wallIndex: best.wallIndex,
      distance: best.distance,
    })
  }

  candidates.sort((a, b) => a.distance - b.distance)
  const kept: typeof candidates = []
  for (const candidate of candidates) {
    const duplicate = kept.some(
      (other) =>
        other.wallIndex === candidate.wallIndex &&
        Math.hypot(
          other.opening.at.x - candidate.opening.at.x,
          other.opening.at.y - candidate.opening.at.y
        ) <
          Math.max(other.opening.width, candidate.opening.width) * 0.45
    )
    if (!duplicate) kept.push(candidate)
  }
  return kept.map((candidate) => candidate.opening)
}

/** 도면에 표기된 전체 가로 치수로 자동 축척을 보정한다. */
export function rescalePlanToWidth(plan: RawPlan, knownWidthMm: number): RawPlan {
  if (!Number.isFinite(knownWidthMm) || knownWidthMm <= 0 || plan.walls.length === 0) return plan
  const xs = plan.walls.flatMap((wall) => [wall.a.x, wall.b.x])
  const currentWidth = Math.max(...xs) - Math.min(...xs)
  if (!Number.isFinite(currentWidth) || currentWidth <= 0) return plan
  const factor = knownWidthMm / currentWidth
  const scalePoint = (point: Pt): Pt => ({ x: point.x * factor, y: point.y * factor })

  return {
    ...plan,
    walls: plan.walls.map((wall) => ({
      a: scalePoint(wall.a),
      b: scalePoint(wall.b),
      thickness: wall.thickness * factor,
    })),
    openings: plan.openings.map((opening) => ({
      ...opening,
      at: scalePoint(opening.at),
      width: opening.width * factor,
    })),
    rooms: plan.rooms.map((room) => ({
      ...room,
      polygon: room.polygon.map(scalePoint),
      areaM2: room.areaM2 * factor * factor,
    })),
    mmPerPx: plan.mmPerPx * factor,
  }
}

/** 전체 파이프라인 — Gray → 정규화 전 RawPlan (호출부가 normalizeAiPlan으로 검증) */
export function buildPlanFromImage(inputGray: Gray, opts: PlanVisionOpts): RawPlan {
  let gray = inputGray
  if (opts.morphCloseRadius && opts.morphCloseRadius > 0)
    gray = morphClose(gray, opts.morphCloseRadius)
  if (opts.denoiseMinComponentPx && opts.denoiseMinComponentPx > 0)
    gray = removeSmallComponents(gray, opts.denoiseMinComponentPx)
  const wallsPx = findWalls(gray, {
    minThicknessPx: opts.minThicknessPx,
    minLengthPx: opts.minLengthPx,
  })
  const mmPerPx = estimateScale(wallsPx, opts.exteriorWallMm)

  const walls = wallsPx.map((w) => ({
    a: { x: w.x1 * mmPerPx, y: w.y1 * mmPerPx },
    b: { x: w.x2 * mmPerPx, y: w.y2 * mmPerPx },
    thickness: w.thickness * mmPerPx,
  }))
  const openings = wallsPx
    .filter((w) => {
      if (!w.openingAfter) return false
      const mm = w.openingAfter.gapPx * mmPerPx
      return mm >= opts.gapRangeMm[0] && mm <= opts.gapRangeMm[1]
    })
    .map((w) => ({
      type: 'door' as const,
      at: { x: w.openingAfter!.at * mmPerPx, y: w.y1 * mmPerPx },
      width: w.openingAfter!.gapPx * mmPerPx,
    }))
  const findBestRooms = (minAreaM2: number) => {
    const lineRooms = detectRooms(gray, wallsPx, { mmPerPx, minAreaM2 })
    const inkRooms = detectRooms(gray, wallsPx, {
      mmPerPx,
      minAreaM2,
      includeSourceInk: true,
    })
    return inkRooms.length > lineRooms.length ? inkRooms : lineRooms
  }
  let roomList = findBestRooms(opts.minRoomAreaM2)
  // 외벽 두께만으로 축척을 추정하면 컬러/저해상도 도면에서 방 면적이 실제보다
  // 작게 계산될 수 있다. 방이 거의 없을 때만 면적 문턱을 낮춰 한 번 더 탐색한다.
  if (roomList.length < 2) {
    const fallbackRooms = findBestRooms(Math.max(0.25, opts.minRoomAreaM2 * 0.2))
    if (fallbackRooms.length >= 2 && fallbackRooms.length <= 20) roomList = fallbackRooms
  }
  const names = ['안방', '방1', '방2', '방3', '방4', '방5', '방6', '방7', '방8']
  const rooms = [...roomList]
    .sort((a, b) => b.areaM2 - a.areaM2)
    .map((r, i) => ({ name: names[i] ?? `방${i + 1}`, polygon: r.polygon, areaM2: r.areaM2 }))

  return { wallHeight: opts.wallHeightMm, walls, openings, rooms, mmPerPx }
}
// ── CV 전처리 개선 (문헌 기반: 텍스트/그래픽 분리, Otsu, 모폴로지, Manhattan 스냅) ──

/** 연결요소 라벨링 후 크기가 minSizePx 미만인 잉크 덩어리(텍스트·기호) 제거 */
export function removeSmallComponents(gray: Gray, minSizePx: number): Gray {
  const { width: W, height: H } = gray
  const out = new Uint8Array(gray.data)
  const visited = new Uint8Array(W * H)
  const queue = new Int32Array(W * H)
  for (let i = 0; i < W * H; i++) {
    if (!gray.data[i] || visited[i]) continue
    // BFS로 컴포넌트 수집
    const comp: number[] = []
    let qs = 0
    let qe = 0
    visited[i] = 1
    queue[qe++] = i
    while (qs < qe) {
      const c = queue[qs++]
      comp.push(c)
      const x = c % W
      const y = (c / W) | 0
      if (x > 0 && gray.data[c - 1] && !visited[c - 1]) {
        visited[c - 1] = 1
        queue[qe++] = c - 1
      }
      if (x < W - 1 && gray.data[c + 1] && !visited[c + 1]) {
        visited[c + 1] = 1
        queue[qe++] = c + 1
      }
      if (y > 0 && gray.data[c - W] && !visited[c - W]) {
        visited[c - W] = 1
        queue[qe++] = c - W
      }
      if (y < H - 1 && gray.data[c + W] && !visited[c + W]) {
        visited[c + W] = 1
        queue[qe++] = c + W
      }
    }
    if (comp.length < minSizePx) for (const c of comp) out[c] = 0
  }
  return { data: out, width: W, height: H }
}

/** Otsu 자동 임계값 (RGBA luminance 히스토그램) */
export function autoThresholdOtsu(rgba: Uint8ClampedArray, width: number, height: number): number {
  void width
  void height
  const hist = new Float64Array(256)
  let total = 0
  for (let p = 0; p < rgba.length; p += 4) {
    if (rgba[p + 3] === 0) continue
    const lum = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2])
    hist[lum]++
    total++
  }
  if (total === 0) return 128
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let bestVar = -1
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > bestVar) {
      bestVar = between
      best = t
    }
  }
  return best
}

/** 이진 모폴로지 클로징 (dilate → erode, 박스 커널) — 작은 균열 봉합 */
export function morphClose(gray: Gray, radius: number): Gray {
  if (radius <= 0) return gray
  const dilate = (src: Uint8Array) => {
    const out = new Uint8Array(src.length)
    for (let y = 0; y < gray.height; y++) {
      for (let x = 0; x < gray.width; x++) {
        let v = 0
        for (let d = -radius; d <= radius && !v; d++) {
          const xx = Math.min(gray.width - 1, Math.max(0, x + d))
          if (src[y * gray.width + xx]) v = 255
        }
        out[y * gray.width + x] = v
      }
    }
    return out
  }
  const erode = (src: Uint8Array) => {
    const out = new Uint8Array(src.length)
    for (let y = 0; y < gray.height; y++) {
      for (let x = 0; x < gray.width; x++) {
        let v = 255
        for (let d = -radius; d <= radius && v; d++) {
          const xx = Math.min(gray.width - 1, Math.max(0, x + d))
          if (!src[y * gray.width + xx]) v = 0
        }
        out[y * gray.width + x] = v
      }
    }
    return out
  }
  // 두 축 순차 적용 (박스 커널 = 분리 가능)
  const d1 = dilate(gray.data)
  const t = gray.width
  const d2 = new Uint8Array(d1.length)
  for (let y = 0; y < gray.height; y++) {
    for (let x = 0; x < gray.width; x++) {
      let v = 0
      for (let d = -radius; d <= radius && !v; d++) {
        const yy = Math.min(gray.height - 1, Math.max(0, y + d))
        if (d1[yy * t + x]) v = 255
      }
      d2[y * t + x] = v
    }
  }
  const e1 = erode(d2)
  const e2 = new Uint8Array(e1.length)
  for (let y = 0; y < gray.height; y++) {
    for (let x = 0; x < gray.width; x++) {
      let v = 255
      for (let d = -radius; d <= radius && v; d++) {
        const yy = Math.min(gray.height - 1, Math.max(0, y + d))
        if (!e1[yy * t + x]) v = 0
      }
      e2[y * t + x] = v
    }
  }
  return { data: e2, width: gray.width, height: gray.height }
}

/** 방 폴리곤 직교 스냅 — 축에 가까운 변을 정렬 (Manhattan 가정) */
export function orthogonalizePolygon(poly: Pt[], toleranceMm: number): Pt[] {
  const pts = poly.map((p) => ({ ...p }))
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const dx = Math.abs(b.x - a.x)
      const dy = Math.abs(b.y - a.y)
      if (dy <= toleranceMm && dy <= dx) {
        const avg = (a.y + b.y) / 2
        a.y = avg
        b.y = avg
      } else if (dx <= toleranceMm) {
        const avg = (a.x + b.x) / 2
        a.x = avg
        b.x = avg
      }
    }
  }
  return pts
}

export function invertGray(gray: Gray): Gray {
  const out = new Uint8Array(gray.data.length)
  for (let i = 0; i < out.length; i++) out[i] = gray.data[i] ? 0 : 255
  return { data: out, width: gray.width, height: gray.height }
}

export function inkRatio(gray: Gray): number {
  let n = 0
  for (let i = 0; i < gray.data.length; i++) if (gray.data[i]) n++
  return n / gray.data.length
}
