import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  autoBinarizeFloorPlan,
  detectPlanRegions,
  shouldInvertDarkBackground,
  type Gray,
} from './planVision'

function rgba(width: number, height: number, background: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = background
    data[index + 1] = background
    data[index + 2] = background
    data[index + 3] = 255
  }
  return data
}

function fillRect(
  data: Uint8ClampedArray,
  imageWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number
) {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) {
      const offset = (py * imageWidth + px) * 4
      data[offset] = value
      data[offset + 1] = value
      data[offset + 2] = value
    }
  }
}

function gray(width: number, height: number): Gray {
  return { data: new Uint8Array(width * height), width, height }
}

function drawBox(target: Gray, x: number, y: number, width: number, height: number, thickness = 4) {
  for (let offset = 0; offset < thickness; offset++) {
    for (let px = x; px < x + width; px++) {
      target.data[(y + offset) * target.width + px] = 255
      target.data[(y + height - 1 - offset) * target.width + px] = 255
    }
    for (let py = y; py < y + height; py++) {
      target.data[py * target.width + x + offset] = 255
      target.data[py * target.width + x + width - 1 - offset] = 255
    }
  }
  for (const fraction of [1 / 3, 2 / 3]) {
    const innerX = Math.round(x + width * fraction)
    const innerY = Math.round(y + height * fraction)
    for (let offset = 0; offset < thickness; offset++) {
      for (let px = x; px < x + width; px++) {
        target.data[(innerY + offset) * target.width + px] = 255
      }
      for (let py = y; py < y + height; py++) {
        target.data[py * target.width + innerX + offset] = 255
      }
    }
  }
}

async function fixtureGray(file: string): Promise<Gray> {
  const { data, info } = await sharp(`e2e/fixtures/${file}`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return autoBinarizeFloorPlan(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    info.width,
    info.height
  ).gray
}

describe('어두운 배경 자동 반전 판단', () => {
  it('검은 테두리와 밝은 내부를 가진 도면은 반전한다', () => {
    const data = rgba(40, 30, 12)
    fillRect(data, 40, 5, 4, 30, 22, 210)
    expect(shouldInvertDarkBackground(data, 40, 30)).toBe(true)
  })

  it('흰 배경의 일반 도면은 반전하지 않는다', () => {
    const data = rgba(40, 30, 245)
    fillRect(data, 40, 8, 8, 24, 14, 20)
    expect(shouldInvertDarkBackground(data, 40, 30)).toBe(false)
  })

  it('가운데가 어두워도 테두리가 밝으면 반전하지 않는다', () => {
    const data = rgba(40, 30, 245)
    fillRect(data, 40, 5, 4, 30, 22, 15)
    expect(shouldInvertDarkBackground(data, 40, 30)).toBe(false)
  })

  it('검은 배경과 중간 밝기 채움은 버리고 밝은 벽선만 잉크로 만든다', () => {
    const data = rgba(40, 30, 12)
    fillRect(data, 40, 5, 4, 30, 22, 105)
    fillRect(data, 40, 7, 6, 26, 2, 240)
    const result = autoBinarizeFloorPlan(data, 40, 30)
    expect(result.polarity).toBe('light-on-dark')
    expect(result.gray.data[10 * 40 + 10]).toBe(0)
    expect(result.gray.data[6 * 40 + 10]).toBe(255)
  })

  it('흰 배경 도면은 기존 Otsu 이진화 결과를 그대로 유지한다', () => {
    const data = rgba(40, 30, 245)
    fillRect(data, 40, 8, 8, 24, 3, 20)
    const result = autoBinarizeFloorPlan(data, 40, 30)
    expect(result.polarity).toBe('dark-on-light')
    expect(result.gray.data[9 * 40 + 12]).toBe(255)
    expect(result.gray.data[20 * 40 + 12]).toBe(0)
  })
})

describe('복수 평면 영역 감지', () => {
  it('하나의 큰 폐쇄 도면은 단일 영역이다', () => {
    const image = gray(240, 180)
    drawBox(image, 20, 20, 200, 140)
    expect(detectPlanRegions(image)).toHaveLength(1)
  })

  it('충분히 떨어진 두 개의 큰 도면을 독립 영역으로 찾는다', () => {
    const image = gray(300, 220)
    drawBox(image, 10, 10, 120, 90)
    drawBox(image, 170, 120, 120, 90)
    expect(detectPlanRegions(image)).toHaveLength(2)
  })

  it('작은 텍스트·치수선 조각은 별도 도면으로 세지 않는다', () => {
    const image = gray(240, 180)
    drawBox(image, 20, 25, 200, 135)
    drawBox(image, 2, 2, 8, 6, 1)
    expect(detectPlanRegions(image)).toHaveLength(1)
  })

  it.each(['real-wikimedia-somerville.png', 'real-wikimedia-paris-plan.jpg'])(
    '실제 복수 평면 %s를 두 영역 이상으로 감지한다',
    async (file) => {
      const regions = detectPlanRegions(await fixtureGray(file))
      expect(regions.length).toBeGreaterThanOrEqual(2)
    }
  )

  it.each([
    'real-wikimedia-harris-1920.jpg',
    'real-wikimedia-state-house-1930.jpg',
    'real-wikimedia-space-apartment.png',
  ])('실제 단일 평면 %s를 복수 입력으로 오탐하지 않는다', async (file) => {
    expect(detectPlanRegions(await fixtureGray(file)).length).toBeLessThanOrEqual(1)
  })
})
