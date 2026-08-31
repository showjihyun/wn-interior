import type { Product } from '../domain/model'
import type { ApprovedProductMeshCatalog } from './ports'
import type { ApprovedProductMesh } from './productMeshApproval'
import { buildProductMeshFingerprint } from './generatedMeshLifecycle'

export type ProductVisualDecision =
  | { kind: 'local-review-mesh'; asset: LocalReviewProductMesh }
  | { kind: 'approved-mesh'; asset: ApprovedProductMesh }
  | { kind: 'user-model'; url: string }
  | { kind: 'decal' }
  | { kind: 'parametric' }

export interface ProductVisualResolver {
  resolve(product: Product): ProductVisualDecision
}

export interface LocalReviewProductMesh {
  assetId: string
  productId: string
  productFingerprint: string
  uri: string
  sha256: string
  byteLength: number
  generatedAt: string
  generatorLabel: string
  reviewReady: boolean
  reviewIssues: string[]
  maxDimensionRatioError: number
  reviewReportUrl?: string
}

export function createProductVisualResolver(
  catalog: ApprovedProductMeshCatalog,
  localReviews: readonly LocalReviewProductMesh[] = []
): ProductVisualResolver {
  return {
    resolve(product) {
      const fingerprint = buildProductMeshFingerprint(product)
      const localReview = localReviews.find(
        (asset) => asset.productId === product.id && asset.productFingerprint === fingerprint
      )
      if (localReview) return { kind: 'local-review-mesh', asset: localReview }
      const approved = catalog.findForProduct(product.id, fingerprint)
      if (approved) return { kind: 'approved-mesh', asset: approved }
      if (
        product.category === 'custom' &&
        product.modelUrl &&
        /^https?:\/\//.test(product.modelUrl)
      ) {
        return { kind: 'user-model', url: product.modelUrl }
      }
      if (product.appearance) return { kind: 'decal' }
      return { kind: 'parametric' }
    },
  }
}
