import { describe, expect, it, vi } from 'vitest'
import type { Product } from '../../domain/model'
import type { ProductCatalog } from '../../application/ports'
import type { ApprovedProductMesh } from '../../application/productMeshApproval'
import { buildProductMeshFingerprint } from '../../application/generatedMeshLifecycle'
import { StaticApprovedMeshCatalog } from './StaticApprovedMeshCatalog'

const assetHash = 'a'.repeat(64)
const product: Product = {
  id: 'retail-chair',
  name: '공식 치수 의자',
  category: 'living',
  dims: { w: 500, d: 500, h: 800 },
  mount: 'floor',
  shape: 'chair',
  appearance: {
    textureUrl: '/catalog/chair.jpg',
    imageSourceUrl: 'https://example.com/chair',
    sha256: 'b'.repeat(64),
    projection: 'front',
  },
}
const fingerprint = buildProductMeshFingerprint(product)
const products: ProductCatalog = {
  findById: (id) => (id === product.id ? product : undefined),
  list: () => [product],
}
const published: ApprovedProductMesh = {
  assetId: 'chair-v1',
  productId: product.id,
  productFingerprint: fingerprint,
  uri: `/catalog/generated/${assetHash}.glb`,
  sha256: assetHash,
  byteLength: 100_000,
  publishedAt: '2026-08-28T01:00:00.000Z',
  generatorLabel: 'Test Generator 1.0',
  visualOnly: true,
}

describe('공개 메시 카탈로그', () => {
  it('PII 없는 v2 published manifest에서 현재 제품 fingerprint와 일치하는 자산만 조회한다', () => {
    const catalog = new StaticApprovedMeshCatalog(products, {
      schemaVersion: 2,
      assets: [published],
    })

    expect(catalog.findForProduct(product.id, fingerprint)).toEqual(published)
    expect(catalog.findForProduct(product.id, `${fingerprint}-stale`)).toBeUndefined()
    expect(catalog.list()).toEqual([published])
  })

  it('reviewer·권리·quarantine 내부 정보가 섞인 runtime manifest를 거절한다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const catalog = new StaticApprovedMeshCatalog(products, {
      schemaVersion: 2,
      assets: [{ ...published, reviewer: 'private@example.com' }],
    })

    expect(catalog.list()).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
