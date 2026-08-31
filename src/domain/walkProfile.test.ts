import { describe, expect, it } from 'vitest'
import { characterRadius, WALK_EYE_RATIO } from './walkProfile'

describe('walk profile', () => {
  it('몸무게에 따른 반경을 안전 범위로 제한한다', () => {
    expect(characterRadius(65)).toBe(116)
    expect(characterRadius(-100)).toBe(100)
    expect(characterRadius(1000)).toBe(220)
    expect(WALK_EYE_RATIO).toBeCloseTo(0.94)
  })
})
