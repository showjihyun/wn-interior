// 계약 테스트 — 배치 확정의 방 경계·충돌·예외 규칙
import { describe, it, expect } from 'vitest'
import { canDropAt } from './drop'
import { SAMPLE_PLAN } from '../../infrastructure/reference-data/data/samplePlan'
import type { Placement, Product } from '../model'

const sofa: Product = {
  id: 'p-sofa3',
  name: '소파',
  category: 'living',
  dims: { w: 2100, d: 950, h: 850 },
  mount: 'floor',
  shape: 'sofa3',
}
const rug: Product = {
  id: 'p-rug',
  name: '러그',
  category: 'living',
  dims: { w: 2900, d: 2000, h: 15 },
  mount: 'floor',
  shape: 'rug',
}
const tvWall: Product = {
  id: 'p-tv-wall',
  name: '벽걸이TV',
  category: 'appliance',
  dims: { w: 1670, d: 90, h: 970 },
  mount: 'wall-mount',
  snapToWall: true,
  defaultElevation: 900,
  shape: 'tvWall',
}

const self: Placement = {
  id: 'self',
  productId: 'p-sofa3',
  pos: { x: 6800, y: 0, z: 4300 },
  rotY: 0,
}
const rugPl: Placement = { id: 'rug', productId: 'p-rug', pos: { x: 6800, y: 0, z: 3000 }, rotY: 0 }

describe('canDropAt (이동 확정 검사)', () => {
  it('거실 중앙 빈 곳은 통과', () => {
    const r = canDropAt(SAMPLE_PLAN, sofa, [self], 'self', 9000, 5000, 0, () => sofa)
    expect(r.ok).toBe(true)
  })

  it('도면 밖이면 out-of-room 거절', () => {
    const r = canDropAt(SAMPLE_PLAN, sofa, [self], 'self', 12000, 9000, 0, () => sofa)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('out-of-room')
  })

  it('제품 중심이 방 안이어도 바닥 footprint가 방 경계를 넘으면 거절한다', () => {
    const plan = {
      unit: 'mm' as const,
      wallHeight: 2400,
      walls: [],
      openings: [],
      rooms: [
        {
          id: 'compact-room',
          name: '작은 방',
          polygon: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 4000 },
            { x: 0, y: 4000 },
          ],
        },
      ],
    }

    const result = canDropAt(plan, sofa, [], null, 500, 2000, 0, () => sofa)

    expect(result).toEqual({ ok: false, reason: 'out-of-room' })
  })

  it('다른 가구와 겹치면 collision 거절 (러그는 예외 — 바닥재성)', () => {
    // productOf 콜백은 productId를 받는다
    // 소파가 러그 위로 이동 → 러그는 겹침 예외라 통과
    const ok = canDropAt(SAMPLE_PLAN, sofa, [self, rugPl], 'self', 6800, 3000, 0, (pid) =>
      pid === 'p-rug' ? rug : sofa
    )
    expect(ok.ok).toBe(true)
    // 소파끼리 겹침 → 거절
    const other: Placement = {
      id: 'other',
      productId: 'p-sofa3',
      pos: { x: 9000, y: 0, z: 5000 },
      rotY: 0,
    }
    const bad = canDropAt(SAMPLE_PLAN, sofa, [self, other], 'self', 9000, 5000, 0, () => sofa)
    expect(bad.ok).toBe(false)
    expect(bad.reason).toBe('collision')
  })

  it('wall-mount 제품은 충돌 판정에서 제외된다', () => {
    const tv: Placement = {
      id: 'tv',
      productId: 'p-tv-wall',
      pos: { x: 4780, y: 900, z: 4300 },
      rotY: 90,
    }
    const r = canDropAt(SAMPLE_PLAN, sofa, [self, tv], 'self', 6800, 4300, 0, (pid) =>
      pid === 'p-tv-wall' ? tvWall : sofa
    )
    expect(r.ok).toBe(true)
  })

  it('자기 자신과는 충돌로 취급하지 않는다', () => {
    const r = canDropAt(SAMPLE_PLAN, sofa, [self], 'self', 6800, 4300, 15, () => sofa)
    expect(r.ok).toBe(true)
  })

  it('다른 배치의 사용자 실측 치수 오버라이드를 충돌 판정에 사용한다', () => {
    const other: Placement = {
      id: 'other-override',
      productId: sofa.id,
      pos: { x: 9000, y: 0, z: 5000 },
      rotY: 0,
      dimsOverride: { w: 4200, d: 950, h: 850 },
    }

    const result = canDropAt(SAMPLE_PLAN, sofa, [other], null, 5900, 5000, 0, () => sofa)

    expect(result).toEqual({ ok: false, reason: 'collision' })
  })
})
