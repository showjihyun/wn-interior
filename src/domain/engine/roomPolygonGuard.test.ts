import { describe, expect, it } from 'vitest'
import {
  cleanRoomPolygon,
  guardRoomPolygons,
  roomPolygonIntersectionArea,
  snapRoomPolygonToWalls,
  validateRoomPolygon,
  type RoomPolygonPoint,
} from './roomPolygonGuard'

const square = (minX: number, minY: number, maxX: number, maxY: number) => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY },
]

describe('cleanRoomPolygon', () => {
  it('removes a closing duplicate, consecutive duplicates, and collinear vertices', () => {
    const input = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ]

    const result = cleanRoomPolygon(input)

    expect(result.polygon).toEqual(square(0, 0, 10, 10))
    expect(result.removedConsecutiveDuplicates).toBe(2)
    expect(result.removedCollinearVertices).toBe(1)
    expect(input).toHaveLength(7)
  })

  it('collapses a zero-area backtracking spike without mutating the input', () => {
    const input = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 6, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const original = structuredClone(input)

    expect(cleanRoomPolygon(input).polygon).toEqual(square(0, 0, 10, 10))
    expect(input).toEqual(original)
  })
})

describe('validateRoomPolygon', () => {
  it('accepts a finite simple polygon', () => {
    expect(validateRoomPolygon(square(0, 0, 10, 10), { minArea: 50 })).toEqual({
      valid: true,
      area: 100,
      issues: [],
      selfIntersections: [],
    })
  })

  it('rejects non-finite coordinates', () => {
    const result = validateRoomPolygon([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0 },
      { x: 0, y: 1 },
    ])

    expect(result.valid).toBe(false)
    expect(result.issues).toContain('non-finite-coordinate')
  })

  it('rejects a self-intersecting bow tie', () => {
    const result = validateRoomPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ])

    expect(result.valid).toBe(false)
    expect(result.issues).toContain('self-intersection')
    expect(result.selfIntersections).toEqual([[0, 2]])
  })

  it('rejects polygons at or below the configured minimum area', () => {
    const result = validateRoomPolygon(square(0, 0, 2, 2), { minArea: 4 })

    expect(result.valid).toBe(false)
    expect(result.issues).toContain('area-below-minimum')
  })
})

describe('snapRoomPolygonToWalls', () => {
  it('snaps only vertices within the configured wall distance', () => {
    const result = snapRoomPolygonToWalls(
      [
        { x: 2, y: 0 },
        { x: 102, y: 0 },
        { x: 102, y: 100 },
        { x: 2, y: 100 },
      ],
      [{ a: { x: 0, y: -10 }, b: { x: 0, y: 110 } }],
      3
    )

    expect(result.snappedVertices).toBe(2)
    expect(result.polygon).toEqual([
      { x: 0, y: 0 },
      { x: 102, y: 0 },
      { x: 102, y: 100 },
      { x: 0, y: 100 },
    ])
  })

  it('ignores non-finite and zero-length wall centerlines', () => {
    const polygon = square(0, 0, 10, 10)
    const result = snapRoomPolygonToWalls(
      polygon,
      [
        { a: { x: 1, y: 1 }, b: { x: 1, y: 1 } },
        { a: { x: Number.NaN, y: 0 }, b: { x: 10, y: 0 } },
      ],
      20
    )

    expect(result).toEqual({ polygon, snappedVertices: 0 })
    expect(result.polygon).not.toBe(polygon)
  })
})

describe('roomPolygonIntersectionArea', () => {
  it('calculates overlap for concave polygons', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 4 },
      { x: 0, y: 4 },
    ]

    expect(roomPolygonIntersectionArea(concave, square(0.5, 0.5, 2, 2))).toBeCloseTo(1.25)
  })

  it('does not count a shared boundary as overlap area', () => {
    expect(roomPolygonIntersectionArea(square(0, 0, 10, 10), square(10, 0, 20, 10))).toBe(0)
  })
})

describe('guardRoomPolygons', () => {
  it('returns repaired accepted rooms and per-room diagnostics', () => {
    const polygon: RoomPolygonPoint[] = [
      { x: 1, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 1, y: 10 },
      { x: 1, y: 0 },
    ]
    const rooms = [{ id: 'room-a', name: 'A', polygon }]

    const result = guardRoomPolygons(rooms, {
      walls: [{ a: { x: 0, y: -5 }, b: { x: 0, y: 15 } }],
      snapDistance: 2,
    })

    expect(result.shouldFallback).toBe(false)
    expect(result.accepted).toEqual([{ id: 'room-a', name: 'A', polygon: square(0, 0, 10, 10) }])
    expect(result.diagnostics.polygons[0]).toMatchObject({
      accepted: true,
      removedConsecutiveDuplicates: 1,
      removedCollinearVertices: 1,
      snappedVertices: 2,
      area: 100,
    })
    expect(rooms[0].polygon).toBe(polygon)
    expect(polygon[0]).toEqual({ x: 1, y: 0 })
  })

  it('rejects invalid rooms and signals fallback above the invalid-room limit', () => {
    const result = guardRoomPolygons(
      [
        { id: 'valid', polygon: square(0, 0, 10, 10) },
        {
          id: 'invalid',
          polygon: [
            { x: 20, y: 0 },
            { x: 30, y: 10 },
            { x: 20, y: 10 },
            { x: 30, y: 0 },
          ],
        },
      ],
      { maxInvalidFraction: 0.49 }
    )

    expect(result.accepted.map((room) => room.id)).toEqual(['valid'])
    expect(result.rejected.map(({ room }) => room.id)).toEqual(['invalid'])
    expect(result.diagnostics.invalidFraction).toBe(0.5)
    expect(result.shouldFallback).toBe(true)
    expect(result.fallbackReasons).toEqual(['invalid-polygons-threshold-exceeded'])
  })

  it('does not trigger invalid fallback when the fraction equals the limit', () => {
    const result = guardRoomPolygons(
      [
        { id: 'valid', polygon: square(0, 0, 10, 10) },
        { id: 'invalid', polygon: [{ x: 0, y: 0 }] },
      ],
      { maxInvalidFraction: 0.5 }
    )

    expect(result.shouldFallback).toBe(false)
  })

  it('detects severe pair overlap and reports all affected rooms', () => {
    const result = guardRoomPolygons(
      [
        { id: 'a', polygon: square(0, 0, 10, 10) },
        { id: 'b', polygon: square(5, 5, 15, 15) },
      ],
      {
        severePairOverlapFraction: 0.2,
        maxSevereOverlapAffectedFraction: 0.5,
      }
    )

    expect(result.diagnostics.overlaps).toEqual([
      {
        firstIndex: 0,
        secondIndex: 1,
        firstId: 'a',
        secondId: 'b',
        overlapArea: 25,
        smallerRoomFraction: 0.25,
        severe: true,
      },
    ])
    expect(result.diagnostics.severeOverlapAffectedCount).toBe(2)
    expect(result.diagnostics.severeOverlapAffectedFraction).toBe(1)
    expect(result.shouldFallback).toBe(true)
    expect(result.fallbackReasons).toEqual(['severe-overlap-threshold-exceeded'])
  })

  it('keeps boundary-touching rooms and an empty input safe', () => {
    const touching = guardRoomPolygons([
      { id: 'a', polygon: square(0, 0, 10, 10) },
      { id: 'b', polygon: square(10, 0, 20, 10) },
    ])
    const empty = guardRoomPolygons([])

    expect(touching.diagnostics.overlaps).toEqual([])
    expect(touching.shouldFallback).toBe(false)
    expect(empty.diagnostics.invalidFraction).toBe(0)
    expect(empty.diagnostics.severeOverlapAffectedFraction).toBe(0)
    expect(empty.shouldFallback).toBe(false)
  })

  it('rejects nonsensical option ranges early', () => {
    expect(() => guardRoomPolygons([], { snapDistance: -1 })).toThrow(RangeError)
    expect(() => guardRoomPolygons([], { maxInvalidFraction: 1.01 })).toThrow(RangeError)
  })
})
