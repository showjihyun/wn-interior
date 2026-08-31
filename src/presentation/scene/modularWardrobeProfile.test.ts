import { describe, expect, it } from 'vitest'
import { createModularWardrobeProfile } from './modularWardrobeProfile'

describe('PAX/FORSAND 모듈형 옷장 profile', () => {
  it('공식 2000×600×2012mm envelope에 100cm 프레임 2개와 50cm 도어 4개를 배치한다', () => {
    const dims = { w: 2000, d: 600, h: 2012 }
    const profile = createModularWardrobeProfile(dims, {
      frameCount: 2,
      doorCount: 4,
      doorHeight: 1950,
    })

    expect(profile).toMatchObject({ frameCount: 2, doorCount: 4, handlesIncluded: false })
    expect(profile.parts.filter((part) => part.role === 'frame')).toHaveLength(2)
    expect(profile.parts.filter((part) => part.role === 'door')).toHaveLength(4)
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
      minX: -1000,
      maxX: 1000,
      minY: 0,
      maxY: 2012,
      minZ: -300,
      maxZ: 300,
    })
  })

  it('작은 사용자 치수와 잘못된 모듈 수에서도 음수 판재를 만들지 않는다', () => {
    const profile = createModularWardrobeProfile(
      { w: 100, d: 80, h: 120 },
      { frameCount: 0, doorCount: -1, doorHeight: 1000 }
    )

    expect(profile.frameCount).toBeGreaterThan(0)
    expect(profile.doorCount).toBeGreaterThan(0)
    expect(profile.parts.every((part) => part.size.every((value) => value > 0))).toBe(true)
    expect(profile.parts.every((part) => part.position.every(Number.isFinite))).toBe(true)
  })
})
