import { describe, expect, it } from 'vitest'
import type { Product } from '../domain/model'
import {
  buildProductMeshFingerprint,
  publishGeneratedProductMesh,
  type ProductMeshHumanReview,
  type ProductMeshSourceAuthorization,
  type QuarantinedGeneratedMesh,
} from './generatedMeshLifecycle'

const imageHash = 'b'.repeat(64)
const contentHash = 'a'.repeat(64)
const product: Product = {
  id: 'approval-sofa',
  name: '승인 대상 소파',
  category: 'living',
  dims: { w: 2280, d: 950, h: 830 },
  mount: 'floor',
  shape: 'sofa3',
  appearance: {
    textureUrl: '/catalog/sofa.jpg',
    imageSourceUrl: 'https://example.com/sofa',
    sha256: imageHash,
    projection: 'front',
  },
}
const fingerprint = buildProductMeshFingerprint(product)
const asset: QuarantinedGeneratedMesh = {
  quarantineId: 'job-1',
  productId: product.id,
  productFingerprint: fingerprint,
  sourceImageSha256: imageHash,
  contentSha256: contentHash,
  byteLength: 1000,
  generatedAt: '2026-08-28T00:00:00.000Z',
  generator: { name: 'TripoSR', version: '2024.03', modelDigest: 'c'.repeat(64) },
  inspection: {
    bounds: { w: 2.28, d: 0.95, h: 0.83 },
    triangles: 20_000,
    silhouetteIou: 0.86,
  },
  reviewViews: [
    { name: 'view-000.png', sha256: '1'.repeat(64), byteLength: 2 },
    { name: 'view-001.png', sha256: '2'.repeat(64), byteLength: 2 },
    { name: 'view-002.png', sha256: '3'.repeat(64), byteLength: 2 },
  ],
}
const authorization: ProductMeshSourceAuthorization = {
  attestationId: 'rights-1',
  productFingerprint: fingerprint,
  commercialUseAllowed: true,
  derivativeUseAllowed: true,
  allowedTerritories: ['KR'],
  evidenceRef: 'legal-1',
  issuedAt: '2026-08-28T00:00:00.000Z',
}
const review: ProductMeshHumanReview = {
  reviewId: 'review-1',
  contentSha256: contentHash,
  decision: 'approved',
  reviewerRef: 'reviewer-1',
  reviewedAt: '2026-08-28T01:00:00.000Z',
  reviewedViewHashes: ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)],
  visualOnlyAcknowledged: true,
}

describe('독립 승인 기록 조합', () => {
  it('권리 증거가 없거나 review hash가 다르면 publish를 거절한다', () => {
    const result = publishGeneratedProductMesh(
      product,
      asset,
      { ...authorization, derivativeUseAllowed: false },
      { ...review, contentSha256: 'd'.repeat(64) }
    )

    expect(result).toEqual({
      published: false,
      reasons: expect.arrayContaining(['rights-not-approved', 'review-content-mismatch']),
    })
  })

  it('상품 fingerprint가 바뀐 오래된 검역 자산을 거절한다', () => {
    const result = publishGeneratedProductMesh(
      { ...product, dims: { ...product.dims, w: 2300 } },
      asset,
      authorization,
      review
    )

    expect(result).toEqual({
      published: false,
      reasons: expect.arrayContaining(['stale-product-fingerprint']),
    })
  })

  it('quarantine에 없는 회전 view hash를 사람 검수 증거로 인정하지 않는다', () => {
    const result = publishGeneratedProductMesh(product, asset, authorization, {
      ...review,
      reviewedViewHashes: ['1'.repeat(64), '2'.repeat(64), '9'.repeat(64)],
    })

    expect(result).toEqual({
      published: false,
      reasons: expect.arrayContaining(['review-view-mismatch']),
    })
  })

  it('공식 W/H·D/H 비율 오차가 5%를 넘는 생성 형상의 게시를 거절한다', () => {
    const result = publishGeneratedProductMesh(
      product,
      {
        ...asset,
        inspection: {
          bounds: { w: 1.0905915, d: 0.8701018, h: 0.4998182 },
          triangles: 58_532,
          silhouetteIou: 0.923,
        },
      },
      authorization,
      review
    )

    expect(result).toEqual({
      published: false,
      reasons: expect.arrayContaining(['geometry-not-approved']),
    })
  })

  it('부동소수점 오차와 무관하게 정확히 5%인 치수 비율 경계는 허용한다', () => {
    const result = publishGeneratedProductMesh(
      product,
      {
        ...asset,
        inspection: {
          ...asset.inspection,
          bounds: {
            w: product.dims.w / product.dims.h,
            d: (product.dims.d / product.dims.h) * 1.05,
            h: 1,
          },
        },
      },
      authorization,
      review
    )

    expect(result).toEqual({
      published: true,
      asset: expect.objectContaining({ productId: product.id, visualOnly: true }),
    })
  })
})
