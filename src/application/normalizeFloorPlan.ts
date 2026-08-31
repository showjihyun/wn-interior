// ─────────────────────────────────────────────────────────────
// AI 도면 해석 응답 정규화
// LLM 출력은 불완전하므로: id 부여·무효 데이터 제거·기본값 보정을 여기서 수행
// ─────────────────────────────────────────────────────────────
import type { FloorPlan, Opening, OpeningType, Pt, Room, Wall } from '../domain/model'

export interface NormalizeResult {
  ok: boolean
  error?: string
  plan?: Pick<FloorPlan, 'unit' | 'wallHeight' | 'walls' | 'openings' | 'rooms'>
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}

const validPt = (p: unknown): p is Pt => {
  if (!p || typeof p !== 'object') return false
  const q = p as Record<string, unknown>
  return Number.isFinite(num(q.x, NaN)) && Number.isFinite(num(q.y, NaN))
}

const DEFAULT_OPENING: Record<OpeningType, { width: number; height: number; sill: number }> = {
  door: { width: 800, height: 2050, sill: 0 },
  entry: { width: 1100, height: 2100, sill: 0 },
  window: { width: 1500, height: 1500, sill: 900 },
}

export function normalizeAiPlan(raw: unknown): NormalizeResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '응답이 객체가 아닙니다.' }
  const src = raw as Record<string, unknown>
  const wallsSrc = Array.isArray(src.walls) ? src.walls : []

  // ── 벽 ──
  const walls: Wall[] = []
  const wallIds = new Set<string>()
  wallsSrc.forEach((w, i) => {
    const item = w as Record<string, unknown>
    const a = item.a as unknown
    const b = item.b as unknown
    if (!validPt(a) || !validPt(b)) return // 무효 좌표 → 제거
    const aP = { x: num(a.x), y: num(a.y) }
    const bP = { x: num(b.x), y: num(b.y) }
    if (aP.x === bP.x && aP.y === bP.y) return // 길이 0 → 제거
    const id = typeof item.id === 'string' && item.id ? item.id : `w${i + 1}`
    let uid = id
    let n = 1
    while (wallIds.has(uid)) uid = `${id}-${n++}` // 중복 id 방지
    wallIds.add(uid)
    walls.push({ id: uid, a: aP, b: bP, thickness: Math.max(50, num(item.thickness, 120)) })
  })

  if (walls.length === 0) return { ok: false, error: '벽 데이터가 없습니다.' }

  // ── 개구부 ──
  const openings: Opening[] = []
  if (Array.isArray(src.openings)) {
    for (const o of src.openings) {
      const item = o as Record<string, unknown>
      const wallId = String(item.wallId ?? '')
      if (!wallIds.has(wallId)) continue // 고아 개구부 → 버림
      const type: OpeningType =
        item.type === 'entry' ? 'entry' : item.type === 'window' ? 'window' : 'door'
      const def = DEFAULT_OPENING[type]
      openings.push({
        id: typeof item.id === 'string' && item.id ? item.id : `o${openings.length + 1}`,
        wallId,
        type,
        offset: Math.max(0, num(item.offset, 100)),
        width: Math.max(300, num(item.width, def.width)),
        height: Math.max(500, num(item.height, def.height)),
        sill: Math.max(0, num(item.sill, def.sill)),
      })
    }
  }

  // ── 방 ──
  const rooms: Room[] = []
  if (Array.isArray(src.rooms)) {
    for (const r of src.rooms) {
      const item = r as Record<string, unknown>
      const poly = Array.isArray(item.polygon)
        ? (item.polygon.filter(validPt) as Pt[]).map((p) => ({ x: num(p.x), y: num(p.y) }))
        : []
      if (poly.length < 3) continue // 깨진 폴리곤 → 제거
      rooms.push({
        id: typeof item.id === 'string' && item.id ? item.id : `r${rooms.length + 1}`,
        name:
          typeof item.name === 'string' && item.name.trim()
            ? item.name.trim()
            : `방 ${rooms.length + 1}`,
        polygon: poly,
      })
    }
  }

  return {
    ok: true,
    plan: {
      unit: 'mm',
      wallHeight: Math.max(2000, num(src.wallHeight, 2400)),
      walls,
      openings,
      rooms,
    },
  }
}
