import {
  isGeneratedMeshDimensionRatioAcceptable,
  measureGeneratedMeshGeometryQuality,
} from './generatedMeshGeometryQuality.ts'

interface ReviewProductSnapshot {
  id: string
  dims: { w: number; d: number; h: number }
}

interface ReviewMeshSnapshot {
  productId: string
  inspection: {
    bounds: { w: number; d: number; h: number }
    triangles: number
    silhouetteIou: number
  }
  reviewViews: ReadonlyArray<unknown>
}

export interface GeneratedMeshReviewAssessment {
  silhouetteIou: number
  axisStretchRatio: number
  maxDimensionRatioError: number
  triangles: number
  reviewViewCount: number
  readyForHumanReview: boolean
  issues: string[]
}

export function assessGeneratedMeshForReview(
  product: ReviewProductSnapshot,
  asset: ReviewMeshSnapshot
): GeneratedMeshReviewAssessment {
  const bounds = asset.inspection.bounds
  const geometry = measureGeneratedMeshGeometryQuality(product.dims, bounds)
  const issues: string[] = []
  if (asset.productId !== product.id) issues.push('product-mismatch')
  if (!geometry.validBounds || geometry.axisStretchRatio > 2) {
    issues.push('axis-stretch-too-large')
  }
  if (
    !geometry.validBounds ||
    !isGeneratedMeshDimensionRatioAcceptable(geometry.maxDimensionRatioError)
  ) {
    issues.push('dimension-ratio-error-too-large')
  }
  if (!Number.isFinite(asset.inspection.silhouetteIou) || asset.inspection.silhouetteIou < 0.75) {
    issues.push('silhouette-score-too-low')
  }
  if (asset.inspection.triangles <= 0 || asset.inspection.triangles > 500_000) {
    issues.push('triangle-budget-exceeded')
  }
  if (asset.reviewViews.length < 4) issues.push('insufficient-review-views')
  return {
    silhouetteIou: asset.inspection.silhouetteIou,
    axisStretchRatio: geometry.axisStretchRatio,
    maxDimensionRatioError: geometry.maxDimensionRatioError,
    triangles: asset.inspection.triangles,
    reviewViewCount: asset.reviewViews.length,
    readyForHumanReview: issues.length === 0,
    issues,
  }
}
