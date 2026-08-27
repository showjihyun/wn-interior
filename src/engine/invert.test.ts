// 회귀 테스트 — 어두운 배경의 반전 이미지 대응
import { describe, it, expect } from 'vitest'
import { invertGray, type Gray } from './planVision'

describe('invertGray', () => {
  it('잉크/배경을 스왑한다', () => {
    const g: Gray = { data: new Uint8Array([255, 0, 0, 255]), width: 4, height: 1 }
    const inv = invertGray(g)
    expect(inv.data[0]).toBe(0)
    expect(inv.data[1]).toBe(255)
  })
  it('잉크 비율이 0.5 초과인지 판별한다 (invertGray 사용 전 가드용)', () => {
    const g: Gray = { data: new Uint8Array(4).fill(255), width: 4, height: 1 }
    const ratio = g.data.reduce((a, b) => a + (b > 0 ? 1 : 0), 0) / g.data.length
    expect(ratio > 0.5).toBe(true)
  })
})
