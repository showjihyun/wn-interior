import { describe, expect, it } from 'vitest'
import { createOpenBookcaseProfile } from './openBookcaseProfile'

describe('BILLY 열린 책장 profile', () => {
  it('공식 800×280×2020mm envelope 안에 5개 선반과 판재를 배치한다', () => {
    const dims = { w: 800, d: 280, h: 2020 }
    const profile = createOpenBookcaseProfile(dims)

    expect(profile.shelfCount).toBe(5)
    expect(profile.parts.filter((part) => part.role === 'shelf')).toHaveLength(5)
    expect(profile.parts.filter((part) => part.role === 'side')).toHaveLength(2)
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
      minX: -dims.w / 2,
      maxX: dims.w / 2,
      minY: 0,
      maxY: dims.h,
      minZ: -dims.d / 2,
      maxZ: dims.d / 2,
    })
  })

  it('작은 사용자 치수에서도 모든 판재와 선반 간격을 양수로 유지한다', () => {
    const profile = createOpenBookcaseProfile({ w: 120, d: 80, h: 180 })

    expect(profile.parts.length).toBeGreaterThan(0)
    expect(profile.parts.every((part) => part.size.every((value) => value > 0))).toBe(true)
    expect(profile.parts.every((part) => part.position.every(Number.isFinite))).toBe(true)
  })
})
