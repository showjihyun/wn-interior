// 계약 테스트 — AI 도면 입력의 정규화·거부·기본값 규칙
import { describe, it, expect } from 'vitest'
import { normalizeAiPlan } from './normalizeFloorPlan'

describe('normalizeAiPlan', () => {
  it('벽 데이터가 없으면 실패를 반환한다', () => {
    expect(normalizeAiPlan({}).ok).toBe(false)
    expect(normalizeAiPlan({ walls: [] }).ok).toBe(false)
  })

  it('id가 없는 벽에 순서대로 id를 부여한다', () => {
    const r = normalizeAiPlan({
      walls: [
        { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
        { a: { x: 1000, y: 0 }, b: { x: 1000, y: 2000 } },
      ],
    })
    expect(r.ok).toBe(true)
    expect(r.plan!.walls.map((w) => w.id)).toEqual(['w1', 'w2'])
  })

  it('좌표가 유효하지 않은 벽은 제거한다', () => {
    const r = normalizeAiPlan({
      walls: [
        { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 } },
        { a: { x: 'abc' }, b: { x: 1, y: 2 } }, // 무효
      ],
    })
    expect(r.ok).toBe(true)
    expect(r.plan!.walls).toHaveLength(1)
  })

  it('존재하지 않는 wallId의 개구부는 버린다', () => {
    const r = normalizeAiPlan({
      walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 } }],
      openings: [
        { wallId: 'w1', type: 'door', offset: 100, width: 800, height: 2000, sill: 0 },
        { wallId: 'wX', type: 'window', offset: 0, width: 100, height: 100, sill: 0 },
      ],
    })
    expect(r.plan!.openings).toHaveLength(1)
    expect(r.plan!.openings[0].wallId).toBe('w1')
  })

  it('개구부 누락 치수를 타입 기본값으로 채운다', () => {
    const r = normalizeAiPlan({
      walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 } }],
      openings: [
        { wallId: 'w1', type: 'door' },
        { wallId: 'w1', type: 'window' },
      ],
    })
    const [door, win] = r.plan!.openings
    expect(door.width).toBe(800)
    expect(door.height).toBeGreaterThanOrEqual(2000)
    expect(door.sill).toBe(0)
    expect(win.sill).toBeGreaterThanOrEqual(900)
    expect(win.width).toBeGreaterThan(0)
  })

  it('꼭짓점 3개 미만 방은 제거하고 이름/ID를 정규화한다', () => {
    const r = normalizeAiPlan({
      walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 } }],
      rooms: [
        {
          name: '안방',
          polygon: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
        },
        {
          name: '깨진방',
          polygon: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        },
        {
          polygon: [
            { x: 0, y: 0 },
            { x: 500, y: 0 },
            { x: 500, y: 500 },
          ],
        }, // 이름 없음
      ],
    })
    expect(r.plan!.rooms.map((x) => x.id)).toEqual(['r1', 'r2'])
    expect(r.plan!.rooms[0].name).toBe('안방')
    expect(r.plan!.rooms[1].name).toContain('방') // 폴백 이름
  })

  it('wallHeight 기본값은 2400이고 숫자로 강제된다', () => {
    const r1 = normalizeAiPlan({ walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }] })
    expect(r1.plan!.wallHeight).toBe(2400)
    const r2 = normalizeAiPlan({
      wallHeight: '2600',
      walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }],
    })
    expect(r2.plan!.wallHeight).toBe(2600)
  })
})
