import type { RawPlan } from './planVision'
import { guardRoomPolygons, type WallCenterline } from './roomPolygonGuard'

export interface PredictedRoom {
  name?: string
  polygon: Array<{ x: number; y: number }>
}

export interface Raster2SeqPrediction {
  rooms: PredictedRoom[]
  sourceWidth: number
  sourceHeight: number
  safe: boolean
  diagnostics?: Record<string, unknown>
}

export type Raster2SeqFallbackReason =
  | 'server-error'
  | 'server-marked-unsafe'
  | 'invalid-source-dimensions'
  | 'empty-room-set'
  | 'out-of-source-bounds'
  | 'invalid-room-polygons'
  | 'overlapping-room-polygons'
  | 'wall-support-insufficient'
  | 'room-sanity-check-failed'

export interface Raster2SeqRoomSelection {
  plan: RawPlan
  usedRaster2Seq: boolean
  fallbackReason?: Raster2SeqFallbackReason
  diagnostics?: Raster2SeqPrediction['diagnostics']
}

export interface Raster2SeqRoomSelectionOptions {
  /** Pixel dimensions of the mask passed to buildPlanFromImage. */
  targetWidth: number
  targetHeight: number
  /** Maximum distance from a predicted vertex to an existing wall surface. */
  wallSnapDistanceMm?: number
  /** Reject only truly degenerate slivers; legitimate small closets remain valid. */
  minimumRoomAreaMm2?: number
  /** Minimum boundary sample fraction close to detected wall surfaces. */
  minimumWallSupportFraction?: number
  /** Boundary samples farther than this from all wall surfaces are unsupported. */
  wallSupportDistanceMm?: number
}

const finitePositive = (value: number) => Number.isFinite(value) && value > 0

const wallSurfaces = (walls: RawPlan['walls']): WallCenterline[] => {
  const surfaces: WallCenterline[] = []
  for (const wall of walls) {
    const dx = wall.b.x - wall.a.x
    const dy = wall.b.y - wall.a.y
    const length = Math.hypot(dx, dy)
    if (!finitePositive(length) || !finitePositive(wall.thickness)) continue
    const normalX = (-dy / length) * (wall.thickness / 2)
    const normalY = (dx / length) * (wall.thickness / 2)
    surfaces.push(
      {
        a: { x: wall.a.x + normalX, y: wall.a.y + normalY },
        b: { x: wall.b.x + normalX, y: wall.b.y + normalY },
      },
      {
        a: { x: wall.a.x - normalX, y: wall.a.y - normalY },
        b: { x: wall.b.x - normalX, y: wall.b.y - normalY },
      }
    )
  }
  return surfaces
}

const polygonArea = (polygon: ReadonlyArray<{ x: number; y: number }>) => {
  let twiceArea = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const next = polygon[(index + 1) % polygon.length]
    twiceArea += polygon[index].x * next.y - next.x * polygon[index].y
  }
  return Math.abs(twiceArea) / 2
}

const pointToSegmentDistance = (point: { x: number; y: number }, segment: WallCenterline) => {
  const dx = segment.b.x - segment.a.x
  const dy = segment.b.y - segment.a.y
  const length2 = dx * dx + dy * dy
  if (length2 <= 0) return Infinity
  const t = Math.max(
    0,
    Math.min(1, ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / length2)
  )
  return Math.hypot(point.x - (segment.a.x + dx * t), point.y - (segment.a.y + dy * t))
}

const wallBoundarySupport = (
  rooms: ReadonlyArray<{ polygon: ReadonlyArray<{ x: number; y: number }> }>,
  surfaces: readonly WallCenterline[],
  maximumDistance: number
) => {
  if (surfaces.length === 0) return 0
  const roomFractions = rooms.map((room) => {
    const samples = room.polygon.flatMap((point, index) => {
      const next = room.polygon[(index + 1) % room.polygon.length]
      return [point, { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }]
    })
    if (samples.length === 0) return 0
    const supported = samples.filter((point) =>
      surfaces.some((surface) => pointToSegmentDistance(point, surface) <= maximumDistance)
    ).length
    return supported / samples.length
  })
  return roomFractions.length ? Math.min(...roomFractions) : 0
}

const roomsWithinWallFootprint = (
  rooms: ReadonlyArray<{ polygon: ReadonlyArray<{ x: number; y: number }> }>,
  walls: RawPlan['walls']
) => {
  if (walls.length === 0) return false
  const wallPoints = walls.flatMap((wall) => [wall.a, wall.b])
  const margin = Math.max(500, ...walls.map((wall) => wall.thickness * 2))
  const minX = Math.min(...wallPoints.map((point) => point.x)) - margin
  const maxX = Math.max(...wallPoints.map((point) => point.x)) + margin
  const minY = Math.min(...wallPoints.map((point) => point.y)) - margin
  const maxY = Math.max(...wallPoints.map((point) => point.y)) + margin
  return rooms.every((room) =>
    room.polygon.every(
      (point) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
    )
  )
}

const fallback = (
  plan: RawPlan,
  reason: Raster2SeqFallbackReason,
  response?: Raster2SeqPrediction
): Raster2SeqRoomSelection => ({
  plan,
  usedRaster2Seq: false,
  fallbackReason: reason,
  diagnostics: response?.diagnostics,
})

/**
 * Converts source-image pixels to the exact coordinate system used by RawPlan,
 * then accepts the generated room set only when every product-side guard passes.
 */
export function selectRaster2SeqRooms(
  legacyPlan: RawPlan,
  response: Raster2SeqPrediction,
  options: Raster2SeqRoomSelectionOptions
): Raster2SeqRoomSelection {
  if (response.safe !== true) return fallback(legacyPlan, 'server-marked-unsafe', response)
  if (
    !finitePositive(response.sourceWidth) ||
    !finitePositive(response.sourceHeight) ||
    !finitePositive(options.targetWidth) ||
    !finitePositive(options.targetHeight) ||
    !finitePositive(legacyPlan.mmPerPx)
  ) {
    return fallback(legacyPlan, 'invalid-source-dimensions', response)
  }
  if (!Array.isArray(response.rooms) || response.rooms.length === 0) {
    return fallback(legacyPlan, 'empty-room-set', response)
  }

  const sourceTolerance = 1e-3
  const pointsInBounds = response.rooms.every(
    (room) =>
      Array.isArray(room.polygon) &&
      room.polygon.every(
        (point) =>
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          point.x >= -sourceTolerance &&
          point.y >= -sourceTolerance &&
          point.x <= response.sourceWidth + sourceTolerance &&
          point.y <= response.sourceHeight + sourceTolerance
      )
  )
  if (!pointsInBounds) return fallback(legacyPlan, 'out-of-source-bounds', response)

  const scaleX = (options.targetWidth / response.sourceWidth) * legacyPlan.mmPerPx
  const scaleY = (options.targetHeight / response.sourceHeight) * legacyPlan.mmPerPx
  const candidates = response.rooms.map((room, index) => {
    const polygon = room.polygon.map((point) => ({
      x: Math.max(0, Math.min(response.sourceWidth, point.x)) * scaleX,
      y: Math.max(0, Math.min(response.sourceHeight, point.y)) * scaleY,
    }))
    return {
      name: room.name?.trim() || legacyPlan.rooms[index]?.name || `방 ${index + 1}`,
      polygon,
      areaM2: polygonArea(polygon) / 1_000_000,
    }
  })

  const minimumRoomAreaMm2 = options.minimumRoomAreaMm2 ?? 200_000
  const legacyCount = legacyPlan.rooms.length
  const countSane =
    candidates.length >= Math.max(1, Math.floor(legacyCount * 0.25)) &&
    candidates.length <= Math.max(legacyCount * 4, legacyCount + 12)
  if (!countSane) {
    return fallback(legacyPlan, 'room-sanity-check-failed', response)
  }

  const surfaces = wallSurfaces(legacyPlan.walls)
  const guarded = guardRoomPolygons(candidates, {
    minArea: minimumRoomAreaMm2,
    walls: surfaces,
    snapDistance: options.wallSnapDistanceMm ?? 80,
    severePairOverlapFraction: 0.02,
    maxInvalidFraction: 0,
    maxSevereOverlapAffectedFraction: 0,
  })
  if (guarded.diagnostics.invalidCount > 0) {
    return fallback(legacyPlan, 'invalid-room-polygons', response)
  }
  if (guarded.diagnostics.overlaps.length > 0) {
    return fallback(legacyPlan, 'overlapping-room-polygons', response)
  }
  if (guarded.shouldFallback || guarded.accepted.length !== candidates.length) {
    return fallback(legacyPlan, 'invalid-room-polygons', response)
  }
  const supportFraction = wallBoundarySupport(
    guarded.accepted,
    surfaces,
    options.wallSupportDistanceMm ?? 250
  )
  if (supportFraction < (options.minimumWallSupportFraction ?? 0.3)) {
    return fallback(legacyPlan, 'wall-support-insufficient', response)
  }
  if (!roomsWithinWallFootprint(guarded.accepted, legacyPlan.walls)) {
    return fallback(legacyPlan, 'wall-support-insufficient', response)
  }

  const rooms = guarded.accepted.map((room) => ({
    ...room,
    areaM2: polygonArea(room.polygon) / 1_000_000,
  }))
  return {
    plan: { ...legacyPlan, rooms },
    usedRaster2Seq: true,
    diagnostics: response.diagnostics,
  }
}
