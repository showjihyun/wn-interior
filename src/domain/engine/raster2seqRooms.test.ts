import { describe, expect, it } from 'vitest'
import type { RawPlan } from './planVision'
import { selectRaster2SeqRooms, type Raster2SeqPrediction } from './raster2seqRooms'

const legacyPlan = (): RawPlan => ({
  wallHeight: 2400,
  mmPerPx: 10,
  walls: [
    {
      a: { x: 100, y: 0 },
      b: { x: 100, y: 1000 },
      thickness: 20,
    },
  ],
  openings: [],
  rooms: [
    {
      name: '기존 방',
      polygon: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
      ],
      areaM2: 1,
    },
  ],
})

const safeResponse = (): Raster2SeqPrediction => ({
  sourceWidth: 200,
  sourceHeight: 100,
  safe: true,
  rooms: [
    {
      name: '예측 방',
      polygon: [
        { x: 20, y: 10 },
        { x: 80, y: 10 },
        { x: 80, y: 90 },
        { x: 20, y: 90 },
      ],
    },
  ],
})

describe('selectRaster2SeqRooms', () => {
  it('maps source pixels through a different target mask size and replaces the whole set', () => {
    const result = selectRaster2SeqRooms(legacyPlan(), safeResponse(), {
      targetWidth: 100,
      targetHeight: 100,
      wallSnapDistanceMm: 0,
    })

    expect(result.usedRaster2Seq).toBe(true)
    expect(result.plan.rooms).toEqual([
      {
        name: '예측 방',
        polygon: [
          { x: 100, y: 100 },
          { x: 400, y: 100 },
          { x: 400, y: 900 },
          { x: 100, y: 900 },
        ],
        areaM2: 0.24,
      },
    ])
  })

  it('snaps to wall surfaces instead of the wall centerline', () => {
    const response: Raster2SeqPrediction = {
      sourceWidth: 100,
      sourceHeight: 100,
      safe: true,
      rooms: [
        {
          polygon: [
            { x: 8.5, y: 10 },
            { x: 50, y: 10 },
            { x: 50, y: 90 },
            { x: 8.5, y: 90 },
          ],
        },
      ],
    }

    const result = selectRaster2SeqRooms(legacyPlan(), response, {
      targetWidth: 100,
      targetHeight: 100,
      wallSnapDistanceMm: 10,
    })

    expect(result.usedRaster2Seq).toBe(true)
    expect(result.plan.rooms[0].polygon[0].x).toBe(90)
    expect(result.plan.rooms[0].polygon[3].x).toBe(90)
  })

  const fallbackCases: Array<[string, Raster2SeqPrediction]> = [
    ['server-marked-unsafe', { ...safeResponse(), safe: false }],
    ['empty-room-set', { ...safeResponse(), rooms: [] }],
    [
      'out-of-source-bounds',
      {
        ...safeResponse(),
        rooms: [
          {
            polygon: [
              { x: -2, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
          },
        ],
      },
    ],
  ]

  it.each(fallbackCases)('keeps the exact legacy object for %s', (reason, response) => {
    const legacy = legacyPlan()
    const result = selectRaster2SeqRooms(legacy, response, {
      targetWidth: 100,
      targetHeight: 100,
    })

    expect(result.usedRaster2Seq).toBe(false)
    expect(result.fallbackReason).toBe(reason)
    expect(result.plan).toBe(legacy)
  })

  it('falls back on a self-intersecting room', () => {
    const response: Raster2SeqPrediction = {
      sourceWidth: 100,
      sourceHeight: 100,
      rooms: [
        {
          polygon: [
            { x: 10, y: 10 },
            { x: 90, y: 90 },
            { x: 10, y: 90 },
            { x: 90, y: 10 },
          ],
        },
      ],
      safe: true,
    }

    const result = selectRaster2SeqRooms(legacyPlan(), response, {
      targetWidth: 100,
      targetHeight: 100,
      wallSnapDistanceMm: 0,
    })

    expect(result.usedRaster2Seq).toBe(false)
    expect(result.fallbackReason).toBe('invalid-room-polygons')
  })

  it('falls back when any pair overlaps by more than two percent of the smaller room', () => {
    const response: Raster2SeqPrediction = {
      sourceWidth: 100,
      sourceHeight: 100,
      rooms: [
        {
          polygon: [
            { x: 0, y: 0 },
            { x: 60, y: 0 },
            { x: 60, y: 60 },
            { x: 0, y: 60 },
          ],
        },
        {
          polygon: [
            { x: 50, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 60 },
            { x: 50, y: 60 },
          ],
        },
      ],
      safe: true,
    }

    const result = selectRaster2SeqRooms(legacyPlan(), response, {
      targetWidth: 100,
      targetHeight: 100,
      wallSnapDistanceMm: 0,
    })

    expect(result.usedRaster2Seq).toBe(false)
    expect(result.fallbackReason).toBe('overlapping-room-polygons')
  })

  it('fails closed when the server omits its safety decision', () => {
    const response = safeResponse() as Partial<Raster2SeqPrediction>
    delete response.safe

    const result = selectRaster2SeqRooms(legacyPlan(), response as Raster2SeqPrediction, {
      targetWidth: 100,
      targetHeight: 100,
    })

    expect(result.usedRaster2Seq).toBe(false)
    expect(result.fallbackReason).toBe('server-marked-unsafe')
  })

  it('rejects even a sub-two-percent overlap after wall snapping', () => {
    const response: Raster2SeqPrediction = {
      sourceWidth: 100,
      sourceHeight: 100,
      safe: true,
      rooms: [
        {
          polygon: [
            { x: 0, y: 0 },
            { x: 60, y: 0 },
            { x: 60, y: 60 },
            { x: 0, y: 60 },
          ],
        },
        {
          polygon: [
            { x: 59.5, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 60 },
            { x: 59.5, y: 60 },
          ],
        },
      ],
    }

    const result = selectRaster2SeqRooms(legacyPlan(), response, {
      targetWidth: 100,
      targetHeight: 100,
      wallSnapDistanceMm: 0,
      minimumWallSupportFraction: 0,
    })

    expect(result.usedRaster2Seq).toBe(false)
    expect(result.fallbackReason).toBe('overlapping-room-polygons')
  })

  it('rejects polygons that have no detected-wall support', () => {
    const response = safeResponse()
    response.rooms[0].polygon = [
      { x: 150, y: 10 },
      { x: 190, y: 10 },
      { x: 190, y: 90 },
      { x: 150, y: 90 },
    ]

    const result = selectRaster2SeqRooms(legacyPlan(), response, {
      targetWidth: 100,
      targetHeight: 100,
      wallSupportDistanceMm: 10,
      minimumRoomAreaMm2: 1_000,
    })

    expect(result.usedRaster2Seq).toBe(false)
    expect(result.fallbackReason).toBe('wall-support-insufficient')
  })

  it('requires wall support for every room instead of averaging the whole set', () => {
    const response = safeResponse()
    response.rooms.push({
      polygon: [
        { x: 150, y: 10 },
        { x: 195, y: 10 },
        { x: 195, y: 90 },
        { x: 150, y: 90 },
      ],
    })

    const result = selectRaster2SeqRooms(legacyPlan(), response, {
      targetWidth: 100,
      targetHeight: 100,
      wallSupportDistanceMm: 10,
      minimumRoomAreaMm2: 1_000,
    })

    expect(result.usedRaster2Seq).toBe(false)
    expect(result.fallbackReason).toBe('wall-support-insufficient')
  })
})
