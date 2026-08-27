export interface RoomPolygonPoint {
  x: number
  y: number
}

export interface RoomPolygonLike {
  id?: string | number
  polygon: readonly RoomPolygonPoint[]
}

export interface WallCenterline {
  a: RoomPolygonPoint
  b: RoomPolygonPoint
}

export type RoomPolygonIssue =
  'non-finite-coordinate' | 'too-few-vertices' | 'area-below-minimum' | 'self-intersection'

export interface RoomPolygonValidation {
  valid: boolean
  area: number
  issues: RoomPolygonIssue[]
  selfIntersections: Array<[firstEdge: number, secondEdge: number]>
}

export interface RoomPolygonDiagnostic extends RoomPolygonValidation {
  index: number
  id?: string
  accepted: boolean
  inputVertexCount: number
  outputVertexCount: number
  removedConsecutiveDuplicates: number
  removedCollinearVertices: number
  snappedVertices: number
}

export interface RoomPolygonOverlapDiagnostic {
  firstIndex: number
  secondIndex: number
  firstId?: string
  secondId?: string
  overlapArea: number
  /** Intersection area divided by the smaller room area. */
  smallerRoomFraction: number
  severe: boolean
}

export interface RoomPolygonGuardDiagnostics {
  inputCount: number
  acceptedCount: number
  invalidCount: number
  invalidFraction: number
  severeOverlapPairCount: number
  severeOverlapAffectedCount: number
  /** Number of rooms in severe overlap pairs divided by all input rooms. */
  severeOverlapAffectedFraction: number
  polygons: RoomPolygonDiagnostic[]
  overlaps: RoomPolygonOverlapDiagnostic[]
}

export type RoomPolygonFallbackReason =
  'invalid-polygons-threshold-exceeded' | 'severe-overlap-threshold-exceeded'

export interface RoomPolygonGuardOptions {
  /** Coordinate tolerance used for duplicate, collinearity, and intersection tests. */
  epsilon?: number
  /** Polygons at or below this absolute area are rejected. */
  minArea?: number
  /** Optional wall centerlines used to snap nearby vertices before validation. */
  walls?: readonly WallCenterline[]
  /** Maximum vertex-to-wall distance. Zero disables snapping. */
  snapDistance?: number
  /** A pair is severe when intersection / smaller-room-area reaches this value. */
  severePairOverlapFraction?: number
  /** Trigger fallback when rejected-room count / input count exceeds this value. */
  maxInvalidFraction?: number
  /** Trigger fallback when severe-overlap-affected rooms / input rooms exceeds this value. */
  maxSevereOverlapAffectedFraction?: number
}

export type GuardedRoom<T extends RoomPolygonLike> = Omit<T, 'polygon'> & {
  polygon: RoomPolygonPoint[]
}

export interface RejectedRoom<T extends RoomPolygonLike> {
  room: T
  diagnostic: RoomPolygonDiagnostic
}

export interface RoomPolygonGuardResult<T extends RoomPolygonLike> {
  accepted: Array<GuardedRoom<T>>
  rejected: Array<RejectedRoom<T>>
  diagnostics: RoomPolygonGuardDiagnostics
  shouldFallback: boolean
  fallbackReasons: RoomPolygonFallbackReason[]
}

export interface CleanRoomPolygonResult {
  polygon: RoomPolygonPoint[]
  removedConsecutiveDuplicates: number
  removedCollinearVertices: number
}

const DEFAULT_EPSILON = 1e-6

const cross = (a: RoomPolygonPoint, b: RoomPolygonPoint, c: RoomPolygonPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

const distanceSquared = (a: RoomPolygonPoint, b: RoomPolygonPoint) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

const signedArea = (polygon: readonly RoomPolygonPoint[]) => {
  let twiceArea = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const next = (i + 1) % polygon.length
    twiceArea += polygon[i].x * polygon[next].y - polygon[next].x * polygon[i].y
  }
  return twiceArea / 2
}

const finitePoint = (point: RoomPolygonPoint) =>
  Number.isFinite(point.x) && Number.isFinite(point.y)

const roomId = (room: RoomPolygonLike) => (room.id === undefined ? undefined : String(room.id))

const validateNonNegative = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number`)
  }
  return value
}

const validateFraction = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`)
  }
  return value
}

/**
 * Removes a duplicated closing point, consecutive duplicates, and zero-area
 * collinear detours. The input array and its points are never mutated.
 */
export function cleanRoomPolygon(
  input: readonly RoomPolygonPoint[],
  epsilon = DEFAULT_EPSILON
): CleanRoomPolygonResult {
  validateNonNegative('epsilon', epsilon)
  const epsilonSquared = epsilon * epsilon
  let removedConsecutiveDuplicates = 0
  let removedCollinearVertices = 0
  const polygon: RoomPolygonPoint[] = []

  for (const point of input) {
    const clone = { x: point.x, y: point.y }
    if (
      polygon.length > 0 &&
      distanceSquared(polygon[polygon.length - 1], clone) <= epsilonSquared
    ) {
      removedConsecutiveDuplicates += 1
    } else {
      polygon.push(clone)
    }
  }

  const removeClosingDuplicate = () => {
    if (
      polygon.length > 1 &&
      distanceSquared(polygon[0], polygon[polygon.length - 1]) <= epsilonSquared
    ) {
      polygon.pop()
      removedConsecutiveDuplicates += 1
      return true
    }
    return false
  }

  removeClosingDuplicate()

  // Each successful pass removes a vertex, so this always terminates.
  let changed = true
  while (changed && polygon.length >= 3) {
    changed = false
    for (let i = 0; i < polygon.length; i += 1) {
      const previous = polygon[(i - 1 + polygon.length) % polygon.length]
      const current = polygon[i]
      const next = polygon[(i + 1) % polygon.length]
      const previousToNext = Math.sqrt(distanceSquared(previous, next))
      const isZeroAreaDetour =
        previousToNext <= epsilon ||
        Math.abs(cross(previous, current, next)) <= epsilon * previousToNext

      if (isZeroAreaDetour) {
        polygon.splice(i, 1)
        removedCollinearVertices += 1
        changed = true
        removeClosingDuplicate()
        break
      }
    }
  }

  return {
    polygon,
    removedConsecutiveDuplicates,
    removedCollinearVertices,
  }
}

function pointOnSegment(
  point: RoomPolygonPoint,
  a: RoomPolygonPoint,
  b: RoomPolygonPoint,
  epsilon: number
) {
  return (
    Math.abs(cross(a, b, point)) <= epsilon &&
    point.x >= Math.min(a.x, b.x) - epsilon &&
    point.x <= Math.max(a.x, b.x) + epsilon &&
    point.y >= Math.min(a.y, b.y) - epsilon &&
    point.y <= Math.max(a.y, b.y) + epsilon
  )
}

function segmentsIntersect(
  a: RoomPolygonPoint,
  b: RoomPolygonPoint,
  c: RoomPolygonPoint,
  d: RoomPolygonPoint,
  epsilon: number
) {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) - epsilon ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) - epsilon ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) - epsilon ||
    Math.max(c.y, d.y) < Math.min(a.y, b.y) - epsilon
  ) {
    return false
  }

  const first = cross(a, b, c)
  const second = cross(a, b, d)
  const third = cross(c, d, a)
  const fourth = cross(c, d, b)
  const properIntersection =
    ((first > epsilon && second < -epsilon) || (first < -epsilon && second > epsilon)) &&
    ((third > epsilon && fourth < -epsilon) || (third < -epsilon && fourth > epsilon))

  return (
    properIntersection ||
    (Math.abs(first) <= epsilon && pointOnSegment(c, a, b, epsilon)) ||
    (Math.abs(second) <= epsilon && pointOnSegment(d, a, b, epsilon)) ||
    (Math.abs(third) <= epsilon && pointOnSegment(a, c, d, epsilon)) ||
    (Math.abs(fourth) <= epsilon && pointOnSegment(b, c, d, epsilon))
  )
}

/** Validates a cleaned or raw polygon without modifying it. */
export function validateRoomPolygon(
  polygon: readonly RoomPolygonPoint[],
  options: Pick<RoomPolygonGuardOptions, 'epsilon' | 'minArea'> = {}
): RoomPolygonValidation {
  const epsilon = validateNonNegative('epsilon', options.epsilon ?? DEFAULT_EPSILON)
  const minArea = validateNonNegative('minArea', options.minArea ?? DEFAULT_EPSILON)
  const issues: RoomPolygonIssue[] = []
  const selfIntersections: Array<[number, number]> = []

  if (!polygon.every(finitePoint)) issues.push('non-finite-coordinate')
  if (polygon.length < 3) issues.push('too-few-vertices')

  const area = polygon.every(finitePoint) && polygon.length >= 3 ? Math.abs(signedArea(polygon)) : 0
  if (area <= minArea) issues.push('area-below-minimum')

  if (polygon.length >= 4 && polygon.every(finitePoint)) {
    for (let first = 0; first < polygon.length; first += 1) {
      const firstNext = (first + 1) % polygon.length
      for (let second = first + 1; second < polygon.length; second += 1) {
        const secondNext = (second + 1) % polygon.length
        const adjacent =
          first === second ||
          firstNext === second ||
          secondNext === first ||
          (first === 0 && secondNext === 0)
        if (adjacent) continue
        if (
          segmentsIntersect(
            polygon[first],
            polygon[firstNext],
            polygon[second],
            polygon[secondNext],
            epsilon
          )
        ) {
          selfIntersections.push([first, second])
        }
      }
    }
  }

  if (selfIntersections.length > 0) issues.push('self-intersection')
  return { valid: issues.length === 0, area, issues, selfIntersections }
}

function projectToSegment(point: RoomPolygonPoint, wall: WallCenterline, epsilon: number) {
  const dx = wall.b.x - wall.a.x
  const dy = wall.b.y - wall.a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= epsilon * epsilon) return undefined
  const rawT = ((point.x - wall.a.x) * dx + (point.y - wall.a.y) * dy) / lengthSquared
  const t = Math.max(0, Math.min(1, rawT))
  const projected = { x: wall.a.x + t * dx, y: wall.a.y + t * dy }
  return { point: projected, distanceSquared: distanceSquared(point, projected) }
}

/** Snaps each vertex to its nearest valid wall segment when it is within range. */
export function snapRoomPolygonToWalls(
  polygon: readonly RoomPolygonPoint[],
  walls: readonly WallCenterline[],
  snapDistance: number,
  epsilon = DEFAULT_EPSILON
) {
  validateNonNegative('snapDistance', snapDistance)
  validateNonNegative('epsilon', epsilon)
  const maximumDistanceSquared = snapDistance * snapDistance
  let snappedVertices = 0
  const snapped = polygon.map((point) => {
    let nearest: { point: RoomPolygonPoint; distanceSquared: number } | undefined
    for (const wall of walls) {
      if (!finitePoint(wall.a) || !finitePoint(wall.b)) continue
      const projection = projectToSegment(point, wall, epsilon)
      if (
        projection &&
        projection.distanceSquared <= maximumDistanceSquared &&
        (!nearest || projection.distanceSquared < nearest.distanceSquared)
      ) {
        nearest = projection
      }
    }
    if (!nearest || nearest.distanceSquared <= epsilon * epsilon) return { ...point }
    snappedVertices += 1
    return nearest.point
  })
  return { polygon: snapped, snappedVertices }
}

function pointInTriangle(
  point: RoomPolygonPoint,
  a: RoomPolygonPoint,
  b: RoomPolygonPoint,
  c: RoomPolygonPoint,
  epsilon: number
) {
  const first = cross(a, b, point)
  const second = cross(b, c, point)
  const third = cross(c, a, point)
  return first >= -epsilon && second >= -epsilon && third >= -epsilon
}

function triangulate(
  polygon: readonly RoomPolygonPoint[],
  epsilon: number
): Array<[RoomPolygonPoint, RoomPolygonPoint, RoomPolygonPoint]> {
  if (polygon.length < 3) return []
  const vertices = signedArea(polygon) >= 0 ? [...polygon] : [...polygon].reverse()
  const remaining = vertices.map((_, index) => index)
  const triangles: Array<[RoomPolygonPoint, RoomPolygonPoint, RoomPolygonPoint]> = []
  let attemptsWithoutEar = 0

  while (remaining.length > 3 && attemptsWithoutEar < remaining.length) {
    let clipped = false
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      const previousIndex = remaining[(cursor - 1 + remaining.length) % remaining.length]
      const currentIndex = remaining[cursor]
      const nextIndex = remaining[(cursor + 1) % remaining.length]
      const a = vertices[previousIndex]
      const b = vertices[currentIndex]
      const c = vertices[nextIndex]
      if (cross(a, b, c) <= epsilon) continue

      const containsVertex = remaining.some((candidate) => {
        if (candidate === previousIndex || candidate === currentIndex || candidate === nextIndex) {
          return false
        }
        return pointInTriangle(vertices[candidate], a, b, c, epsilon)
      })
      if (containsVertex) continue

      triangles.push([a, b, c])
      remaining.splice(cursor, 1)
      clipped = true
      attemptsWithoutEar = 0
      break
    }
    if (!clipped) attemptsWithoutEar += 1
  }

  if (remaining.length === 3) {
    const triangle = remaining.map((index) => vertices[index]) as [
      RoomPolygonPoint,
      RoomPolygonPoint,
      RoomPolygonPoint,
    ]
    if (Math.abs(signedArea(triangle)) > epsilon) triangles.push(triangle)
  }
  return triangles
}

function clipToHalfPlane(
  subject: readonly RoomPolygonPoint[],
  clipStart: RoomPolygonPoint,
  clipEnd: RoomPolygonPoint,
  epsilon: number
) {
  const output: RoomPolygonPoint[] = []
  if (subject.length === 0) return output
  let start = subject[subject.length - 1]
  let startDistance = cross(clipStart, clipEnd, start)

  for (const end of subject) {
    const endDistance = cross(clipStart, clipEnd, end)
    const startInside = startDistance >= -epsilon
    const endInside = endDistance >= -epsilon
    if (startInside !== endInside) {
      const denominator = startDistance - endDistance
      const t = Math.abs(denominator) <= epsilon ? 0 : startDistance / denominator
      output.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t })
    }
    if (endInside) output.push({ ...end })
    start = end
    startDistance = endDistance
  }
  return output
}

function triangleIntersectionArea(
  first: readonly RoomPolygonPoint[],
  second: readonly RoomPolygonPoint[],
  epsilon: number
) {
  let clipped = [...first]
  for (let edge = 0; edge < second.length && clipped.length > 0; edge += 1) {
    clipped = clipToHalfPlane(clipped, second[edge], second[(edge + 1) % second.length], epsilon)
  }
  return clipped.length >= 3 ? Math.abs(signedArea(clipped)) : 0
}

function boundingBoxesOverlap(
  first: readonly RoomPolygonPoint[],
  second: readonly RoomPolygonPoint[],
  epsilon: number
) {
  const bounds = (polygon: readonly RoomPolygonPoint[]) => ({
    minX: Math.min(...polygon.map((point) => point.x)),
    maxX: Math.max(...polygon.map((point) => point.x)),
    minY: Math.min(...polygon.map((point) => point.y)),
    maxY: Math.max(...polygon.map((point) => point.y)),
  })
  const a = bounds(first)
  const b = bounds(second)
  return !(
    a.maxX <= b.minX + epsilon ||
    b.maxX <= a.minX + epsilon ||
    a.maxY <= b.minY + epsilon ||
    b.maxY <= a.minY + epsilon
  )
}

/** Returns the intersection area of two valid, simple polygons, including concave polygons. */
export function roomPolygonIntersectionArea(
  first: readonly RoomPolygonPoint[],
  second: readonly RoomPolygonPoint[],
  epsilon = DEFAULT_EPSILON
) {
  validateNonNegative('epsilon', epsilon)
  if (first.length < 3 || second.length < 3 || !boundingBoxesOverlap(first, second, epsilon)) {
    return 0
  }
  const firstTriangles = triangulate(first, epsilon)
  const secondTriangles = triangulate(second, epsilon)
  let area = 0
  for (const firstTriangle of firstTriangles) {
    for (const secondTriangle of secondTriangles) {
      area += triangleIntersectionArea(firstTriangle, secondTriangle, epsilon)
    }
  }
  return area <= epsilon ? 0 : area
}

/**
 * Cleans, optionally snaps, validates, and cross-checks generated room polygons.
 * A fallback signal means callers should discard the whole generated room set and
 * use their established room generator instead of partially mixing unsafe output.
 */
export function guardRoomPolygons<T extends RoomPolygonLike>(
  rooms: readonly T[],
  options: RoomPolygonGuardOptions = {}
): RoomPolygonGuardResult<T> {
  const epsilon = validateNonNegative('epsilon', options.epsilon ?? DEFAULT_EPSILON)
  const minArea = validateNonNegative('minArea', options.minArea ?? DEFAULT_EPSILON)
  const snapDistance = validateNonNegative('snapDistance', options.snapDistance ?? 0)
  const severePairOverlapFraction = validateFraction(
    'severePairOverlapFraction',
    options.severePairOverlapFraction ?? 0.1
  )
  const maxInvalidFraction = validateFraction(
    'maxInvalidFraction',
    options.maxInvalidFraction ?? 0.01
  )
  const maxSevereOverlapAffectedFraction = validateFraction(
    'maxSevereOverlapAffectedFraction',
    options.maxSevereOverlapAffectedFraction ?? 0.05
  )
  const polygonDiagnostics: RoomPolygonDiagnostic[] = []
  const acceptedEntries: Array<{
    room: GuardedRoom<T>
    originalIndex: number
    area: number
  }> = []
  const rejected: Array<RejectedRoom<T>> = []

  rooms.forEach((room, index) => {
    const inputVertexCount = Array.isArray(room.polygon) ? room.polygon.length : 0
    let cleaned: CleanRoomPolygonResult = {
      polygon: [],
      removedConsecutiveDuplicates: 0,
      removedCollinearVertices: 0,
    }
    let snappedVertices = 0

    if (Array.isArray(room.polygon) && room.polygon.every(finitePoint)) {
      cleaned = cleanRoomPolygon(room.polygon, epsilon)
      if (snapDistance > 0 && options.walls && options.walls.length > 0) {
        const snapped = snapRoomPolygonToWalls(
          cleaned.polygon,
          options.walls,
          snapDistance,
          epsilon
        )
        snappedVertices = snapped.snappedVertices
        const cleanedAfterSnap = cleanRoomPolygon(snapped.polygon, epsilon)
        cleaned = {
          polygon: cleanedAfterSnap.polygon,
          removedConsecutiveDuplicates:
            cleaned.removedConsecutiveDuplicates + cleanedAfterSnap.removedConsecutiveDuplicates,
          removedCollinearVertices:
            cleaned.removedCollinearVertices + cleanedAfterSnap.removedCollinearVertices,
        }
      }
    }

    const validation = validateRoomPolygon(
      Array.isArray(room.polygon) && room.polygon.every(finitePoint)
        ? cleaned.polygon
        : room.polygon,
      { epsilon, minArea }
    )
    const diagnostic: RoomPolygonDiagnostic = {
      index,
      id: roomId(room),
      accepted: validation.valid,
      inputVertexCount,
      outputVertexCount: cleaned.polygon.length,
      removedConsecutiveDuplicates: cleaned.removedConsecutiveDuplicates,
      removedCollinearVertices: cleaned.removedCollinearVertices,
      snappedVertices,
      ...validation,
    }
    polygonDiagnostics.push(diagnostic)

    if (validation.valid) {
      acceptedEntries.push({
        room: { ...room, polygon: cleaned.polygon } as GuardedRoom<T>,
        originalIndex: index,
        area: validation.area,
      })
    } else {
      rejected.push({ room, diagnostic })
    }
  })

  const overlaps: RoomPolygonOverlapDiagnostic[] = []
  const severeOverlapAffected = new Set<number>()
  for (let first = 0; first < acceptedEntries.length; first += 1) {
    for (let second = first + 1; second < acceptedEntries.length; second += 1) {
      const a = acceptedEntries[first]
      const b = acceptedEntries[second]
      const rawOverlapArea = roomPolygonIntersectionArea(a.room.polygon, b.room.polygon, epsilon)
      if (rawOverlapArea <= epsilon) continue
      const overlapArea = Math.min(rawOverlapArea, a.area, b.area)
      const smallerRoomFraction = overlapArea / Math.min(a.area, b.area)
      const severe = smallerRoomFraction >= severePairOverlapFraction
      if (severe) {
        severeOverlapAffected.add(a.originalIndex)
        severeOverlapAffected.add(b.originalIndex)
      }
      overlaps.push({
        firstIndex: a.originalIndex,
        secondIndex: b.originalIndex,
        firstId: roomId(a.room),
        secondId: roomId(b.room),
        overlapArea,
        smallerRoomFraction,
        severe,
      })
    }
  }

  const inputCount = rooms.length
  const invalidCount = rejected.length
  const invalidFraction = inputCount === 0 ? 0 : invalidCount / inputCount
  const severeOverlapAffectedCount = severeOverlapAffected.size
  const severeOverlapAffectedFraction =
    inputCount === 0 ? 0 : severeOverlapAffectedCount / inputCount
  const fallbackReasons: RoomPolygonFallbackReason[] = []
  if (invalidFraction > maxInvalidFraction) {
    fallbackReasons.push('invalid-polygons-threshold-exceeded')
  }
  if (severeOverlapAffectedFraction > maxSevereOverlapAffectedFraction) {
    fallbackReasons.push('severe-overlap-threshold-exceeded')
  }

  return {
    accepted: acceptedEntries.map((entry) => entry.room),
    rejected,
    diagnostics: {
      inputCount,
      acceptedCount: acceptedEntries.length,
      invalidCount,
      invalidFraction,
      severeOverlapPairCount: overlaps.filter((overlap) => overlap.severe).length,
      severeOverlapAffectedCount,
      severeOverlapAffectedFraction,
      polygons: polygonDiagnostics,
      overlaps,
    },
    shouldFallback: fallbackReasons.length > 0,
    fallbackReasons,
  }
}
