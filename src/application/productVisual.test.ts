import { describe, expect, it } from 'vitest'
import type { Product } from '../domain/model'
import type { ApprovedProductMeshCatalog } from './ports'
import type { ApprovedProductMesh } from './productMeshApproval'
import { createProductVisualResolver } from './productVisual'
import { buildProductMeshFingerprint } from './generatedMeshLifecycle'

const product: Product = {
  id: 'retail-sofa',
  name: '실상품 소파',
  category: 'living',
  dims: { w: 2200, d: 900, h: 800 },
  mount: 'floor',
  shape: 'sofa3',
  appearance: {
    textureUrl: '/catalog/sofa.jpg',
    imageSourceUrl: 'https://example.com/sofa',
    sha256: 'b'.repeat(64),
    projection: 'front',
  },
}

const approved: ApprovedProductMesh = {
  assetId: 'approved-sofa',
  productId: product.id,
  productFingerprint: buildProductMeshFingerprint(product),
  uri: `/catalog/generated/${'a'.repeat(64)}.glb`,
  sha256: 'a'.repeat(64),
  byteLength: 1000,
  visualOnly: true,
  publishedAt: '2026-08-28T00:00:00.000Z',
  generatorLabel: 'TripoSR 2024.03',
}

describe('상품 시각화 선택', () => {
  it('별도 승인 카탈로그에 등록된 메시만 최우선 시각화로 선택한다', () => {
    const catalog: ApprovedProductMeshCatalog = {
      findForProduct: (id, candidateFingerprint) =>
        id === product.id && candidateFingerprint === approved.productFingerprint
          ? approved
          : undefined,
      list: () => [approved],
    }
    const resolver = createProductVisualResolver(catalog)

    expect(resolver.resolve(product)).toEqual({ kind: 'approved-mesh', asset: approved })
  })

  it('승인 메시가 없으면 공식 사진 데칼로, 사진도 없으면 파라메트릭 형상으로 복귀한다', () => {
    const catalog: ApprovedProductMeshCatalog = {
      findForProduct: () => undefined,
      list: () => [],
    }
    const resolver = createProductVisualResolver(catalog)

    expect(resolver.resolve(product)).toEqual({ kind: 'decal' })
    expect(resolver.resolve({ ...product, appearance: undefined })).toEqual({ kind: 'parametric' })
  })

  it('기존 사용자 GLTF URL은 승인 생성 메시로 가장하지 않고 별도 미검증 상태로 둔다', () => {
    const catalog: ApprovedProductMeshCatalog = {
      findForProduct: () => undefined,
      list: () => [],
    }
    const resolver = createProductVisualResolver(catalog)

    expect(
      resolver.resolve({
        ...product,
        category: 'custom',
        modelUrl: 'https://example.com/custom.glb',
      })
    ).toEqual({ kind: 'user-model', url: 'https://example.com/custom.glb' })
  })

  it('현재 제품 fingerprint와 일치하는 로컬 검수 메시를 published와 구분해 선택한다', () => {
    const catalog: ApprovedProductMeshCatalog = {
      findForProduct: () => undefined,
      list: () => [],
    }
    const local = {
      assetId: 'local-kivik-v3',
      productId: product.id,
      productFingerprint: buildProductMeshFingerprint(product),
      uri: `/__local-mesh-review__/${'c'.repeat(64)}.glb`,
      sha256: 'c'.repeat(64),
      byteLength: 1234,
      generatedAt: '2026-08-28T00:00:00.000Z',
      generatorLabel: 'TripoSR local review',
      reviewReady: true,
      reviewIssues: [],
      maxDimensionRatioError: 0.01,
    }
    const resolver = createProductVisualResolver(catalog, [local])

    expect(resolver.resolve(product)).toEqual({ kind: 'local-review-mesh', asset: local })
    expect(
      createProductVisualResolver(catalog, [
        { ...local, productFingerprint: `${local.productFingerprint}-stale` },
      ]).resolve(product)
    ).toEqual({ kind: 'decal' })
  })
})
