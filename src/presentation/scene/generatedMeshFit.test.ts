import { describe, expect, it } from 'vitest'
import {
  calculateContainedMeshTransform,
  calculateExactEnvelopeMeshTransform,
} from './generatedMeshFit'

describe('생성 메시의 공식 치수 envelope fitting', () => {
  it('종횡비를 왜곡하지 않고 W/D/H 안에 넣어 바닥 중앙에 정렬한다', () => {
    const transform = calculateContainedMeshTransform(
      { min: { x: -1, y: -0.25, z: -0.5 }, max: { x: 3, y: 1.75, z: 1.5 } },
      { w: 1000, d: 600, h: 500 }
    )

    expect(transform).toEqual({
      scale: 250,
      position: { x: -250, y: 62.5, z: -125 },
      fittedDims: { w: 1000, d: 500, h: 500 },
    })
  })

  it('빈 형상이나 NaN bounds는 메시 대신 폴백하도록 거절한다', () => {
    expect(
      calculateContainedMeshTransform(
        { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: Number.NaN, z: 1 } },
        { w: 1000, d: 600, h: 500 }
      )
    ).toBeNull()
  })

  it('검수 생성 메시를 공식 W/D/H에 축별 보정하고 보정비를 공개한다', () => {
    const transform = calculateExactEnvelopeMeshTransform(
      { min: { x: -1, y: -0.25, z: -0.5 }, max: { x: 3, y: 1.75, z: 1.5 } },
      { w: 1000, d: 600, h: 500 }
    )

    expect(transform).toEqual({
      scale: { x: 250, y: 250, z: 300 },
      position: { x: -250, y: 62.5, z: -150 },
      fittedDims: { w: 1000, d: 600, h: 500 },
      axisStretchRatio: 1.2,
    })
  })
})
