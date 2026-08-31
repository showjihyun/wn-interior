import { describe, expect, it } from 'vitest'
import type { Gray, PlanVisionOpts } from '../domain/engine/planVision'
import type { PlanVisionGateway } from './ports'
import { createFloorPlanPreview } from './createFloorPlanPreview'

const gray: Gray = { data: new Uint8Array(400), width: 20, height: 20 }
const options: PlanVisionOpts = {
  threshold: 128,
  minThicknessPx: 2,
  minLengthPx: 4,
  gapRangeMm: [500, 1400],
  exteriorWallMm: 200,
  minRoomAreaM2: 1,
  wallHeightMm: 2400,
}

function gateway(overrides: Partial<PlanVisionGateway> = {}): PlanVisionGateway {
  return {
    segment: async () => ({
      walls: gray,
      openings: { door: gray, window: gray },
      engineLabel: 'cpu',
      durationMs: 8,
    }),
    rooms: async () => ({
      rooms: [],
      sourceWidth: 20,
      sourceHeight: 20,
      safe: false,
      engineLabel: 'cpu',
      durationMs: 5,
    }),
    ...overrides,
  }
}

describe('CreateFloorPlanPreview', () => {
  it('segmentation 결과를 캐시한다', async () => {
    let calls = 0
    const service = createFloorPlanPreview(
      gateway({
        segment: async () => {
          calls += 1
          return {
            walls: gray,
            openings: { door: gray, window: gray },
            engineLabel: 'cpu',
            durationMs: 8,
          }
        },
      })
    )

    const input = {
      imageDataUrl: 'same-image',
      classicGray: gray,
      classicOptions: options,
      segmentedOptions: options,
      useSegmentation: true,
      useRoomPrediction: false,
      knownWidthMm: 0,
      darkBackground: false,
    }
    const first = await service.execute(input)
    await service.execute(input)

    expect(first.usedSegmentation).toBe(true)
    expect(first.sourceLabel).toContain('CNN(cpu')
    expect(calls).toBe(1)
  })

  it('외부 분석 실패 시 고전 CV로 복구하고 unsafe 방 예측을 거부한다', async () => {
    const service = createFloorPlanPreview(
      gateway({ segment: async () => Promise.reject(new Error('offline')) })
    )

    const result = await service.execute({
      imageDataUrl: 'image',
      classicGray: gray,
      classicOptions: options,
      segmentedOptions: options,
      useSegmentation: true,
      useRoomPrediction: true,
      knownWidthMm: 0,
      darkBackground: true,
    })

    expect(result.usedSegmentation).toBe(false)
    expect(result.sourceLabel).toContain('로컬 모델을 사용할 수 없어 기본 분석으로 처리했습니다')
    expect(result.sourceLabel).toContain('어두운 배경 자동 반전')
    expect(result.sourceLabel).not.toContain('CNN 실패')
    expect(result.sourceLabel).not.toContain('offline')
    expect(result.diagnosticLabel).toContain('CNN 실패(offline)')
    expect(result.roomSourceLabel).toContain('Raster2Seq 거부')
  })

  it('clearCache 뒤에는 같은 이미지를 다시 분석한다', async () => {
    let calls = 0
    const service = createFloorPlanPreview(
      gateway({
        segment: async () => {
          calls += 1
          return {
            walls: gray,
            openings: { door: gray, window: gray },
            engineLabel: 'cpu',
            durationMs: 1,
          }
        },
      })
    )
    const input = {
      imageDataUrl: 'image',
      classicGray: gray,
      classicOptions: options,
      segmentedOptions: options,
      useSegmentation: true,
      useRoomPrediction: false,
      knownWidthMm: 0,
      darkBackground: false,
    }

    await service.execute(input)
    service.clearCache()
    await service.execute(input)

    expect(calls).toBe(2)
  })
})
