import { describe, expect, it } from 'vitest'
import { findOpaqueBounds, fitImageWithinBounds, removeWhiteBackground } from './productTextureMath'

describe('실상품 이미지 배경 제거', () => {
  it('흰 배경은 투명하게 하고 상품 색상은 유지한다', () => {
    const rgba = new Uint8ClampedArray([
      255,
      255,
      255,
      255, // white background
      40,
      90,
      180,
      255, // blue product
    ])

    const result = removeWhiteBackground(rgba)

    expect([...result.slice(0, 4)]).toEqual([255, 255, 255, 0])
    expect([...result.slice(4, 8)]).toEqual([40, 90, 180, 255])
  })

  it('밝은 가장자리는 단계적으로 alpha를 낮춰 흰 테두리를 줄인다', () => {
    const rgba = new Uint8ClampedArray([235, 235, 235, 255])

    const result = removeWhiteBackground(rgba, 245)

    expect(result[3]).toBeGreaterThan(0)
    expect(result[3]).toBeLessThan(255)
  })

  it('투명 배경을 제외한 상품 영역을 찾아 텍스처를 자동 crop할 수 있다', () => {
    const rgba = new Uint8ClampedArray(3 * 2 * 4)
    rgba[(1 * 3 + 1) * 4 + 3] = 255

    expect(findOpaqueBounds(rgba, 3, 2)).toEqual({ x: 1, y: 1, width: 1, height: 1 })
  })

  it('낮은 alpha의 흰 배경 haze는 상품 crop 경계에서 제외한다', () => {
    const rgba = new Uint8ClampedArray(3 * 1 * 4)
    rgba[3] = 28
    rgba[7] = 255
    rgba[11] = 28

    expect(findOpaqueBounds(rgba, 3, 1)).toEqual({ x: 1, y: 0, width: 1, height: 1 })
  })
})

describe('실상품 사진 투영면 fitting', () => {
  it('KIVIK crop 비율을 보존하면서 공식 envelope 안에 contain한다', () => {
    const result = fitImageWithinBounds(1264, 592, 2280 * 1.04, 830 * 1.02)

    expect(result.width / result.height).toBeCloseTo(1264 / 592, 8)
    expect(result.width).toBeLessThanOrEqual(2280 * 1.04)
    expect(result.height).toBeLessThanOrEqual(830 * 1.02)
    expect(result.height).toBeCloseTo(830 * 1.02, 8)
  })

  it('세로형 사진도 비율을 유지하고 최대 폭·높이를 넘지 않는다', () => {
    const result = fitImageWithinBounds(630, 1342, 260, 360)

    expect(result.width / result.height).toBeCloseTo(630 / 1342, 8)
    expect(result.width).toBeLessThanOrEqual(260)
    expect(result.height).toBeLessThanOrEqual(360)
  })
})
