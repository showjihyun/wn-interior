import { describe, expect, it } from 'vitest'
import type { Product } from '../domain/model'
import type { QuarantinedGeneratedMesh } from './generatedMeshLifecycle'
import { assessGeneratedMeshForReview } from './generatedMeshReview'

const product: Product = {
  id: 'kivik',
  name: 'KIVIK',
  category: 'living',
  dims: { w: 2280, d: 950, h: 830 },
  mount: 'floor',
  shape: 'sofa3',
}
const asset: QuarantinedGeneratedMesh = {
  quarantineId: 'job',
  productId: product.id,
  productFingerprint: 'fingerprint',
  sourceImageSha256: 'a'.repeat(64),
  contentSha256: 'b'.repeat(64),
  byteLength: 1000,
  generatedAt: '2026-08-28T00:00:00.000Z',
  generator: { name: 'TripoSR', version: 'v1', modelDigest: 'c'.repeat(64) },
  inspection: {
    bounds: { w: 1.0905915, d: 0.8701018, h: 0.4998182 },
    triangles: 58_532,
    silhouetteIou: 0.923,
  },
  reviewViews: [0, 1, 2, 3, 4].map((index) => ({
    name: `view-${index}.png`,
    sha256: String(index).repeat(64),
    byteLength: 100,
  })),
}

describe('생성 메시 사람 검수 준비도', () => {
  it('공식 W/H·D/H 비율 오차가 5%를 넘는 KIVIK 3차 후보를 차단한다', () => {
    const result = assessGeneratedMeshForReview(product, asset)

    expect(result.axisStretchRatio).toBeCloseTo(1.91, 2)
    expect(result.maxDimensionRatioError).toBeGreaterThan(0.05)
    expect(result.readyForHumanReview).toBe(false)
    expect(result.issues).toContain('dimension-ratio-error-too-large')
  })

  it('공식 치수와 같은 비율의 메시만 사람 검수 가능 상태로 분류한다', () => {
    const result = assessGeneratedMeshForReview(product, {
      ...asset,
      inspection: {
        ...asset.inspection,
        bounds: { w: 2.28, d: 0.95, h: 0.83 },
      },
    })

    expect(result.maxDimensionRatioError).toBe(0)
    expect(result.readyForHumanReview).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('축 보정이 2배를 넘거나 review view가 부족하면 차단한다', () => {
    const result = assessGeneratedMeshForReview(product, {
      ...asset,
      inspection: { ...asset.inspection, bounds: { w: 0.3, d: 1, h: 1 } },
      reviewViews: asset.reviewViews.slice(0, 2),
    })

    expect(result.readyForHumanReview).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining(['axis-stretch-too-large', 'insufficient-review-views'])
    )
  })
})
