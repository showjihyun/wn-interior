import type { FloorPlan, Opening } from './model'
import { pointInPolygon } from './engine/geom'

export interface WallSlice {
  len: number
  hgt: number
  yBase: number
  start: number
}

export function resolveWallMaterialId(
  plan: FloorPlan,
  midX: number,
  midY: number,
  angle: number
): string | undefined {
  const offset = 150
  const normalX = -Math.sin(angle) * offset
  const normalY = Math.cos(angle) * offset
  for (const direction of [1, -1]) {
    const x = midX + normalX * direction
    const y = midY + normalY * direction
    const room = plan.rooms.find((candidate) => pointInPolygon(x, y, candidate.polygon))
    if (room?.wallMaterialId) return room.wallMaterialId
  }
  return undefined
}

export function buildWallSlices(length: number, height: number, openings: Opening[]): WallSlice[] {
  const slices: WallSlice[] = []
  const sorted = [...openings].sort((left, right) => left.offset - right.offset)
  let cursor = 0
  for (const opening of sorted) {
    const start = Math.max(cursor, opening.offset)
    const end = Math.min(length, opening.offset + opening.width)
    if (end <= start) continue
    if (start > cursor) {
      slices.push({ len: start - cursor, hgt: height, yBase: 0, start: cursor })
    }
    if (opening.sill > 0) {
      slices.push({ len: end - start, hgt: opening.sill, yBase: 0, start })
    }
    const topStart = Math.min(height, opening.sill + opening.height)
    if (height > topStart) {
      slices.push({ len: end - start, hgt: height - topStart, yBase: topStart, start })
    }
    cursor = end
  }
  if (cursor < length) slices.push({ len: length - cursor, hgt: height, yBase: 0, start: cursor })
  return slices
}
