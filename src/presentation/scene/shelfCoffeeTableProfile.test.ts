import { describe, expect, it } from 'vitest'
import { createShelfCoffeeTableProfile } from './shelfCoffeeTableProfile'

describe('LACK 하부선반 커피테이블 profile', () => {
  it('공식 1180×780×450mm envelope에 상판·하부선반·다리 4개를 구성한다', () => {
    const profile = createShelfCoffeeTableProfile({ w: 1180, d: 780, h: 450 })

    expect(profile).toMatchObject({ shelfCount: 1, legCount: 4 })
    expect(profile.parts.filter((part) => part.role === 'top')).toHaveLength(1)
    expect(profile.parts.filter((part) => part.role === 'shelf')).toHaveLength(1)
    expect(profile.parts.filter((part) => part.role === 'leg')).toHaveLength(4)
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
      minX: -590,
      maxX: 590,
      minY: 0,
      maxY: 450,
      minZ: -390,
      maxZ: 390,
    })
  })

  it('작은 입력에서도 모든 부품의 크기와 위치가 유효하다', () => {
    const profile = createShelfCoffeeTableProfile({ w: 30, d: 20, h: 15 })

    expect(profile.parts.length).toBeGreaterThan(0)
    expect(profile.parts.every((part) => part.size.every((value) => value > 0))).toBe(true)
    expect(profile.parts.every((part) => part.position.every(Number.isFinite))).toBe(true)
  })
})
