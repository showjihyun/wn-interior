import { describe, expect, it } from 'vitest'
import { createHighBedFrameProfile } from './highBedFrameProfile'

describe('MALM 높은침대프레임 profile', () => {
  it('공식 1660×2090×1000mm envelope 안에 프레임과 미드빔만 구성한다', () => {
    const profile = createHighBedFrameProfile(
      { w: 1660, d: 2090, h: 1000 },
      { footboardHeight: 380, clearance: 210 }
    )

    expect(profile).toMatchObject({
      includesMattress: false,
      includesSlattedBase: false,
      midbeamIncluded: true,
    })
    expect(profile.parts.filter((part) => part.role === 'headboard')).toHaveLength(1)
    expect(profile.parts.filter((part) => part.role === 'footboard')).toHaveLength(1)
    expect(profile.parts.filter((part) => part.role === 'sideRail')).toHaveLength(2)
    expect(profile.parts.filter((part) => part.role === 'midbeam')).toHaveLength(1)
    expect(profile.parts.every((part) => part.size.every((value) => value > 0))).toBe(true)

    const bounds = profile.parts.reduce(
      (result, part) => {
        result.minX = Math.min(result.minX, part.position[0] - part.size[0] / 2)
        result.maxX = Math.max(result.maxX, part.position[0] + part.size[0] / 2)
        result.minY = Math.min(result.minY, part.position[1])
        result.maxY = Math.max(result.maxY, part.position[1] + part.size[1])
        result.minZ = Math.min(result.minZ, part.position[2] - part.size[2] / 2)
        result.maxZ = Math.max(result.maxZ, part.position[2] + part.size[2] / 2)
        return result
      },
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
        minZ: Number.POSITIVE_INFINITY,
        maxZ: Number.NEGATIVE_INFINITY,
      }
    )
    expect(bounds).toEqual({
      minX: -830,
      maxX: 830,
      minY: 0,
      maxY: 1000,
      minZ: -1045,
      maxZ: 1045,
    })
  })

  it('작거나 잘못된 옵션에도 음수 크기 부품을 만들지 않는다', () => {
    const profile = createHighBedFrameProfile(
      { w: 100, d: 120, h: 80 },
      { footboardHeight: -10, clearance: 500 }
    )

    expect(profile.parts.length).toBeGreaterThan(0)
    expect(profile.parts.every((part) => part.size.every((value) => value > 0))).toBe(true)
    expect(profile.parts.every((part) => part.position.every(Number.isFinite))).toBe(true)
  })
})
