import { describe, expect, it, vi } from 'vitest'
import type { Product } from '../domain/model'
import {
  buildProductMeshFingerprint,
  createStageGeneratedProductMesh,
  publishGeneratedProductMesh,
  type GeneratedMeshInspector,
  type GeneratedMeshQuarantine,
  type GeneratedMeshWorker,
  type ProductImageAssetSource,
  type ProductMeshHumanReview,
  type ProductMeshSourceAuthorization,
  type QuarantinedGeneratedMesh,
} from './generatedMeshLifecycle'

const imageHash = 'b'.repeat(64)
const meshHash = 'a'.repeat(64)
const product: Product = {
  id: 'mesh-sofa',
  name: '검역 대상 소파',
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

const authorization: ProductMeshSourceAuthorization = {
  attestationId: 'rights-1',
  productFingerprint: 'filled-per-test',
  commercialUseAllowed: true,
  derivativeUseAllowed: true,
  allowedTerritories: ['KR'],
  evidenceRef: 'legal-evidence-1',
  issuedAt: '2026-08-28T00:00:00.000Z',
}

function dependencies() {
  const imageSource: ProductImageAssetSource = {
    read: vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
      sha256: imageHash,
    }),
  }
  const worker: GeneratedMeshWorker = {
    generate: vi.fn().mockResolvedValue({
      glb: new Uint8Array([4, 5, 6]),
      contentSha256: meshHash,
      sourceImageSha256: imageHash,
      generatedAt: '2026-08-28T01:00:00.000Z',
      generator: { name: 'TripoSR', version: '2024.03', modelDigest: 'c'.repeat(64) },
      silhouetteIou: 0.86,
      reviewViews: [
        { name: 'view-000.png', png: new Uint8Array([7, 8]), sha256: '1'.repeat(64) },
        { name: 'view-001.png', png: new Uint8Array([9, 10]), sha256: '2'.repeat(64) },
        { name: 'view-002.png', png: new Uint8Array([11, 12]), sha256: '3'.repeat(64) },
      ],
    }),
  }
  const inspector: GeneratedMeshInspector = {
    inspect: vi
      .fn()
      .mockResolvedValue({ bounds: { w: 2.28, d: 0.95, h: 0.83 }, triangles: 12_000 }),
  }
  const quarantine: GeneratedMeshQuarantine = {
    save: vi.fn().mockResolvedValue('quarantine/mesh-sofa/job-1.json'),
  }
  return { imageSource, worker, inspector, quarantine }
}

describe('생성 메시 오프라인 lifecycle', () => {
  it('제품 치수나 원본 이미지 지문이 바뀌면 제품 fingerprint도 바뀐다', () => {
    const fingerprint = buildProductMeshFingerprint(product)

    expect(buildProductMeshFingerprint({ ...product, dims: { ...product.dims } })).toBe(fingerprint)
    expect(
      buildProductMeshFingerprint({ ...product, dims: { ...product.dims, w: 2300 } })
    ).not.toBe(fingerprint)
    expect(
      buildProductMeshFingerprint({
        ...product,
        appearance: { ...product.appearance!, sha256: 'd'.repeat(64) },
      })
    ).not.toBe(fingerprint)
  })

  it('파생물 사용 권리가 없으면 이미지나 worker를 호출하지 않는다', async () => {
    const deps = dependencies()
    const stage = createStageGeneratedProductMesh(deps)
    const result = await stage.execute({
      jobId: 'job-1',
      product,
      authorization: {
        ...authorization,
        productFingerprint: buildProductMeshFingerprint(product),
        derivativeUseAllowed: false,
      },
    })

    expect(result).toEqual({ status: 'rejected', reason: 'source-rights-not-approved' })
    expect(deps.imageSource.read).not.toHaveBeenCalled()
    expect(deps.worker.generate).not.toHaveBeenCalled()
  })

  it('worker 출력은 실제 GLB inspector를 거쳐 public이 아닌 quarantine에 저장한다', async () => {
    const deps = dependencies()
    const before = JSON.stringify(product)
    const stage = createStageGeneratedProductMesh(deps)
    const result = await stage.execute({
      jobId: 'job-1',
      product,
      authorization: {
        ...authorization,
        productFingerprint: buildProductMeshFingerprint(product),
        commercialUseAllowed: false,
      },
    })

    expect(result).toEqual({
      status: 'quarantined',
      asset: expect.objectContaining({
        quarantineId: 'job-1',
        contentSha256: meshHash,
        inspection: expect.objectContaining({ triangles: 12_000, silhouetteIou: 0.86 }),
      }),
      quarantineRef: 'quarantine/mesh-sofa/job-1.json',
    })
    expect(deps.inspector.inspect).toHaveBeenCalledWith(new Uint8Array([4, 5, 6]))
    expect(deps.quarantine.save).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(product)).toBe(before)
  })

  it('독립된 권리·사람 검수를 조합해 PII 없는 published manifest 항목만 만든다', () => {
    const fingerprint = buildProductMeshFingerprint(product)
    const asset: QuarantinedGeneratedMesh = {
      quarantineId: 'job-1',
      productId: product.id,
      productFingerprint: fingerprint,
      sourceImageSha256: imageHash,
      contentSha256: meshHash,
      byteLength: 1234,
      generatedAt: '2026-08-28T01:00:00.000Z',
      generator: { name: 'TripoSR', version: '2024.03', modelDigest: 'c'.repeat(64) },
      inspection: {
        bounds: { w: 2.28, d: 0.95, h: 0.83 },
        triangles: 12_000,
        silhouetteIou: 0.86,
      },
      reviewViews: [
        { name: 'view-000.png', sha256: '1'.repeat(64), byteLength: 2 },
        { name: 'view-001.png', sha256: '2'.repeat(64), byteLength: 2 },
        { name: 'view-002.png', sha256: '3'.repeat(64), byteLength: 2 },
      ],
    }
    const review: ProductMeshHumanReview = {
      reviewId: 'review-1',
      contentSha256: meshHash,
      decision: 'approved',
      reviewerRef: 'internal-reviewer-42',
      reviewedAt: '2026-08-28T02:00:00.000Z',
      reviewedViewHashes: ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)],
      visualOnlyAcknowledged: true,
    }
    const result = publishGeneratedProductMesh(
      product,
      asset,
      { ...authorization, productFingerprint: fingerprint },
      review
    )

    expect(result).toEqual({
      published: true,
      asset: expect.objectContaining({
        productId: product.id,
        productFingerprint: fingerprint,
        uri: `/catalog/generated/${meshHash}.glb`,
        visualOnly: true,
      }),
    })
    expect(JSON.stringify(result)).not.toMatch(/reviewer|evidenceRef|attestationId|modelDigest/)
  })
})
