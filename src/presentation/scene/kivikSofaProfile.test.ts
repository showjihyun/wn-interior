import { describe, expect, it } from 'vitest'
import { createKivikSofaProfile } from './kivikSofaProfile'

const officialDims = { w: 2280, d: 950, h: 830 }

describe('KIVIK 전용 3인용소파 profile', () => {
  it('공식 실측 좌석과 낮은 팔걸이·2개 쿠션을 전체 envelope 안에 구성한다', () => {
    const profile = createKivikSofaProfile(officialDims)

    expect(profile).toMatchObject({
      seatWidth: 1800,
      seatDepth: 600,
      seatHeight: 450,
      armWidth: 240,
      seatCushionCount: 2,
      backCushionCount: 2,
    })
    expect(profile.parts.filter((part) => part.role === 'arm')).toHaveLength(2)
    expect(profile.parts.filter((part) => part.role === 'seatCushion')).toHaveLength(2)
    expect(profile.parts.filter((part) => part.role === 'backCushion')).toHaveLength(2)
    expect(profile.parts.filter((part) => part.role === 'foot')).toHaveLength(4)
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
      minX: -1140,
      maxX: 1140,
      minY: 0,
      maxY: 830,
      minZ: -475,
      maxZ: 475,
    })
  })

  it('로컬 공식 DIMMA GLB의 W/H·D/H 비율 증거가 공식 실측과 5% 안에서 일치한다', () => {
    const reference = { w: 2.2834267616271973, d: 0.9570343196392059, h: 0.8575109185430847 }
    const widthHeightError = Math.abs(
      reference.w / reference.h / (officialDims.w / officialDims.h) - 1
    )
    const depthHeightError = Math.abs(
      reference.d / reference.h / (officialDims.d / officialDims.h) - 1
    )

    expect(Math.max(widthHeightError, depthHeightError)).toBeCloseTo(0.0306275483, 8)
    expect(Math.max(widthHeightError, depthHeightError)).toBeLessThanOrEqual(0.05)
  })

  it('작은 사용자 치수에서도 음수·NaN 부품을 만들지 않는다', () => {
    const profile = createKivikSofaProfile({ w: 50, d: 30, h: 20 })

    expect(profile.parts.length).toBeGreaterThan(0)
    expect(profile.parts.every((part) => part.size.every((value) => value > 0))).toBe(true)
    expect(profile.parts.every((part) => part.position.every(Number.isFinite))).toBe(true)
  })
})
