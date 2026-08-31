import { describe, expect, it } from 'vitest'
import type { Placement } from '../domain/model'
import {
  findDuplicatePlacementVariant,
  placementVariantFingerprint,
  type PlacementVariant,
} from './placementVariants'

const placement = (overrides: Partial<Placement> = {}): Placement => ({
  id: 'placement-a',
  productId: 'sofa',
  pos: { x: 1200, y: 0, z: 2400 },
  rotY: 0,
  colorway: '#ffffff',
  ...overrides,
})

describe('placement variant fingerprint', () => {
  it('배치 ID·배열 순서·360도 회전 표현이 달라도 같은 상태로 본다', () => {
    const first = [placement(), placement({ id: 'chair-a', productId: 'chair' })]
    const reordered = [
      placement({ id: 'chair-new', productId: 'chair', rotY: 360 }),
      placement({ id: 'sofa-new', rotY: -360 }),
    ]

    expect(placementVariantFingerprint(reordered)).toBe(placementVariantFingerprint(first))
  })

  it('위치·색상·설치 높이·치수 오버라이드 차이는 다른 상태로 본다', () => {
    const baseline = placementVariantFingerprint([placement()])
    const changed = [
      placement({ pos: { x: 1225, y: 0, z: 2400 } }),
      placement({ colorway: '#000000' }),
      placement({ elevationOverride: 900 }),
      placement({ dimsOverride: { w: 1800, d: 900, h: 800 } }),
    ]

    for (const candidate of changed) {
      expect(placementVariantFingerprint([candidate])).not.toBe(baseline)
    }
  })

  it('동일 fingerprint를 가진 기존 배치안을 찾는다', () => {
    const variants: PlacementVariant[] = [{ id: 'a', name: 'A안', placements: [placement()] }]

    expect(findDuplicatePlacementVariant(variants, [placement({ id: 'new-id' })])?.name).toBe('A안')
  })
})
