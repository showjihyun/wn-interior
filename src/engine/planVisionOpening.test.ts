import { describe, expect, it } from 'vitest'
import { vectorizeOpeningMask, type Gray, type RawPlan } from './planVision'

function mask(width: number, height: number, boxes: [number, number, number, number][]): Gray {
  const data = new Uint8Array(width * height)
  for (const [x1, y1, x2, y2] of boxes)
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) data[y * width + x] = 255
  return { data, width, height }
}

const walls: RawPlan['walls'] = [
  { a: { x: 100, y: 500 }, b: { x: 900, y: 500 }, thickness: 120 },
  { a: { x: 800, y: 100 }, b: { x: 800, y: 900 }, thickness: 120 },
]

describe('vectorizeOpeningMask', () => {
  it('door 연결요소를 가장 가까운 가로 벽에 투영한다', () => {
    const openings = vectorizeOpeningMask(mask(100, 100, [[38, 46, 48, 54]]), walls, 10, 'door')
    expect(openings).toHaveLength(1)
    expect(openings[0].type).toBe('door')
    expect(openings[0].at.y).toBe(500)
    expect(openings[0].at.x).toBeGreaterThan(400)
    expect(openings[0].width).toBe(500)
  })

  it('window 세로 길이를 세로 벽의 opening 폭으로 사용한다', () => {
    const openings = vectorizeOpeningMask(mask(100, 100, [[76, 20, 84, 50]]), walls, 10, 'window')
    expect(openings).toHaveLength(1)
    expect(openings[0]).toMatchObject({ type: 'window', width: 400 })
    expect(openings[0].at.x).toBe(800)
  })

  it('벽에서 너무 먼 작은 노이즈는 제거한다', () => {
    expect(vectorizeOpeningMask(mask(100, 100, [[1, 1, 2, 2]]), walls, 10, 'door')).toEqual([])
  })
})
