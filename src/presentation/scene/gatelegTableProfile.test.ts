import { describe, expect, it } from 'vitest'
import { createGatelegTableProfile } from './gatelegTableProfile'

describe('NORDEN 게이트레그 테이블 profile', () => {
  it('공식 접힘·기본·최대 길이와 890×800×740mm 기본 envelope를 보존한다', () => {
    const dims = { w: 890, d: 800, h: 740 }
    const profile = createGatelegTableProfile(dims, {
      collapsedLength: 260,
      expandedLength: 1520,
    })

    expect(profile).toMatchObject({
      collapsedLength: 260,
      normalLength: 890,
      expandedLength: 1520,
    })
    expect(profile.parts.filter((part) => part.role === 'openLeaf')).toHaveLength(1)
    expect(profile.parts.filter((part) => part.role === 'foldedLeaf')).toHaveLength(1)
    expect(profile.parts.filter((part) => part.role === 'gateLeg').length).toBeGreaterThanOrEqual(2)
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

  it('작은 입력이나 잘못된 옵션에서도 음수 상판·날개·다리를 만들지 않는다', () => {
    const profile = createGatelegTableProfile(
      { w: 180, d: 120, h: 160 },
      { collapsedLength: 400, expandedLength: 100 }
    )

    expect(profile.parts.length).toBeGreaterThan(0)
    expect(profile.parts.every((part) => part.size.every((value) => value > 0))).toBe(true)
    expect(profile.parts.every((part) => part.position.every(Number.isFinite))).toBe(true)
  })

  it('260mm 접힘 상태는 양쪽 날개를 접고 1520mm 확장 상태는 양쪽을 펼친다', () => {
    const collapsed = createGatelegTableProfile(
      { w: 260, d: 800, h: 740 },
      { collapsedLength: 260, expandedLength: 1520 }
    )
    const expanded = createGatelegTableProfile(
      { w: 1520, d: 800, h: 740 },
      { collapsedLength: 260, expandedLength: 1520 }
    )

    expect(collapsed.parts.filter((part) => part.role === 'openLeaf')).toHaveLength(0)
    expect(collapsed.parts.filter((part) => part.role === 'foldedLeaf')).toHaveLength(2)
    expect(expanded.parts.filter((part) => part.role === 'openLeaf')).toHaveLength(2)
    expect(expanded.parts.filter((part) => part.role === 'foldedLeaf')).toHaveLength(0)
  })
})
