import { describe, expect, it } from 'vitest'
import { createTableGlobeLampProfile } from './tableGlobeLampProfile'

describe('FADO 구형 테이블 램프 profile', () => {
  it('모든 부품이 양수 치수이며 현재 FADO의 공식 250×250×240mm envelope를 채운다', () => {
    const dims = { w: 250, d: 250, h: 240 }
    const profile = createTableGlobeLampProfile(dims)

    expect(profile.base.radius).toBeGreaterThan(0)
    expect(profile.base.height).toBeGreaterThan(0)
    expect(profile.base.centerY - profile.base.height / 2).toBe(0)
    expect(profile.globe.radiusX).toBe(dims.w / 2)
    expect(profile.globe.radiusZ).toBe(dims.d / 2)
    expect(profile.globe.radiusY).toBeGreaterThan(0)
    expect(profile.globe.centerY - profile.globe.radiusY).toBeGreaterThanOrEqual(0)
    expect(profile.globe.centerY + profile.globe.radiusY).toBeCloseTo(dims.h, 8)
  })

  it('비정상적으로 작은 입력에서도 음수 cylinder나 sphere 크기를 만들지 않는다', () => {
    const profile = createTableGlobeLampProfile({ w: 20, d: 18, h: 24 })

    expect(Object.values(profile.base).every((value) => value > 0)).toBe(true)
    expect(
      [
        profile.globe.radiusX,
        profile.globe.radiusY,
        profile.globe.radiusZ,
        profile.globe.centerY,
      ].every((value) => value > 0)
    ).toBe(true)
  })
})
