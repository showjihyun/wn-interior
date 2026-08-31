import type { Product, ProductAppearance } from '../domain/model'
import type { ApprovedProductMesh } from './productMeshApproval'
import {
  isGeneratedMeshDimensionRatioAcceptable,
  measureGeneratedMeshGeometryQuality,
} from './generatedMeshGeometryQuality'

export interface ProductMeshSourceAuthorization {
  attestationId: string
  productFingerprint: string
  commercialUseAllowed: boolean
  derivativeUseAllowed: boolean
  allowedTerritories: string[]
  evidenceRef: string
  issuedAt: string
}

export interface ProductMeshHumanReview {
  reviewId: string
  contentSha256: string
  decision: 'approved' | 'rejected'
  reviewerRef: string
  reviewedAt: string
  reviewedViewHashes: string[]
  visualOnlyAcknowledged: true
}

export interface MeshInspectionReport {
  bounds: Product['dims']
  triangles: number
  silhouetteIou: number
}

export interface QuarantinedGeneratedMesh {
  quarantineId: string
  productId: string
  productFingerprint: string
  sourceImageSha256: string
  contentSha256: string
  byteLength: number
  generatedAt: string
  generator: { name: string; version: string; modelDigest: string }
  inspection: MeshInspectionReport
  reviewViews: Array<{ name: string; sha256: string; byteLength: number }>
}

export interface GeneratedMeshReviewView {
  name: string
  png: Uint8Array
  sha256: string
}

export interface ProductImageAsset {
  bytes: Uint8Array
  mimeType: string
  sha256: string
}

export interface ProductImageAssetSource {
  read(appearance: ProductAppearance): Promise<ProductImageAsset>
}

export interface GeneratedMeshWorkerRequest {
  jobId: string
  productId: string
  productFingerprint: string
  targetDims: Product['dims']
  source: ProductImageAsset
}

export interface GeneratedMeshWorkerOutput {
  glb: Uint8Array
  contentSha256: string
  sourceImageSha256: string
  generatedAt: string
  generator: QuarantinedGeneratedMesh['generator']
  silhouetteIou: number
  reviewViews: GeneratedMeshReviewView[]
}

export interface GeneratedMeshWorker {
  generate(request: GeneratedMeshWorkerRequest): Promise<GeneratedMeshWorkerOutput>
}

export interface GeneratedMeshInspector {
  inspect(glb: Uint8Array): Promise<Omit<MeshInspectionReport, 'silhouetteIou'>>
}

export interface GeneratedMeshQuarantine {
  save(
    asset: QuarantinedGeneratedMesh,
    glb: Uint8Array,
    reviewViews: GeneratedMeshReviewView[]
  ): Promise<string>
}

export type StageGeneratedMeshResult =
  | { status: 'quarantined'; asset: QuarantinedGeneratedMesh; quarantineRef: string }
  | {
      status: 'rejected'
      reason:
        | 'source-image-missing'
        | 'source-rights-not-approved'
        | 'source-fingerprint-mismatch'
        | 'worker-output-mismatch'
        | 'generation-failed'
        | 'inspection-failed'
        | 'quarantine-failed'
    }

export interface StageGeneratedProductMesh {
  execute(input: {
    jobId: string
    product: Product
    authorization: ProductMeshSourceAuthorization
  }): Promise<StageGeneratedMeshResult>
}

export function buildProductMeshFingerprint(product: Product): string {
  const appearance = product.appearance
  return [
    'product-mesh-v1',
    product.id,
    product.dims.w,
    product.dims.d,
    product.dims.h,
    product.mount,
    appearance?.sha256 ?? 'no-image',
    appearance?.imageSourceUrl ?? 'no-source',
  ].join('|')
}

export function createStageGeneratedProductMesh(dependencies: {
  imageSource: ProductImageAssetSource
  worker: GeneratedMeshWorker
  inspector: GeneratedMeshInspector
  quarantine: GeneratedMeshQuarantine
}): StageGeneratedProductMesh {
  return {
    async execute({ jobId, product, authorization }) {
      const appearance = product.appearance
      if (!appearance) return { status: 'rejected', reason: 'source-image-missing' }
      const productFingerprint = buildProductMeshFingerprint(product)
      if (
        authorization.productFingerprint !== productFingerprint ||
        !authorization.derivativeUseAllowed ||
        !authorization.allowedTerritories.some(
          (territory) => territory === '*' || territory === 'KR'
        )
      ) {
        return { status: 'rejected', reason: 'source-rights-not-approved' }
      }

      let source: ProductImageAsset
      try {
        source = await dependencies.imageSource.read(appearance)
      } catch {
        return { status: 'rejected', reason: 'source-image-missing' }
      }
      if (source.sha256 !== appearance.sha256) {
        return { status: 'rejected', reason: 'source-fingerprint-mismatch' }
      }

      let output: GeneratedMeshWorkerOutput
      try {
        output = await dependencies.worker.generate({
          jobId,
          productId: product.id,
          productFingerprint,
          targetDims: { ...product.dims },
          source,
        })
      } catch {
        return { status: 'rejected', reason: 'generation-failed' }
      }
      if (
        output.sourceImageSha256 !== source.sha256 ||
        !/^[a-f0-9]{64}$/.test(output.contentSha256) ||
        output.glb.byteLength <= 0
      ) {
        return { status: 'rejected', reason: 'worker-output-mismatch' }
      }

      let inspected: Omit<MeshInspectionReport, 'silhouetteIou'>
      try {
        inspected = await dependencies.inspector.inspect(output.glb)
      } catch {
        return { status: 'rejected', reason: 'inspection-failed' }
      }
      const asset: QuarantinedGeneratedMesh = {
        quarantineId: jobId,
        productId: product.id,
        productFingerprint,
        sourceImageSha256: source.sha256,
        contentSha256: output.contentSha256,
        byteLength: output.glb.byteLength,
        generatedAt: output.generatedAt,
        generator: { ...output.generator },
        inspection: { ...inspected, silhouetteIou: output.silhouetteIou },
        reviewViews: output.reviewViews.map((view) => ({
          name: view.name,
          sha256: view.sha256,
          byteLength: view.png.byteLength,
        })),
      }
      try {
        const quarantineRef = await dependencies.quarantine.save(
          asset,
          output.glb,
          output.reviewViews
        )
        return { status: 'quarantined', asset, quarantineRef }
      } catch {
        return { status: 'rejected', reason: 'quarantine-failed' }
      }
    },
  }
}

export function publishGeneratedProductMesh(
  product: Product,
  asset: QuarantinedGeneratedMesh,
  authorization: ProductMeshSourceAuthorization,
  review: ProductMeshHumanReview
): { published: true; asset: ApprovedProductMesh } | { published: false; reasons: string[] } {
  const reasons: string[] = []
  const fingerprint = buildProductMeshFingerprint(product)
  if (
    asset.productId !== product.id ||
    asset.productFingerprint !== fingerprint ||
    authorization.productFingerprint !== fingerprint
  ) {
    reasons.push('stale-product-fingerprint')
  }
  if (!product.appearance || asset.sourceImageSha256 !== product.appearance.sha256) {
    reasons.push('source-fingerprint-mismatch')
  }
  if (
    !authorization.commercialUseAllowed ||
    !authorization.derivativeUseAllowed ||
    !authorization.allowedTerritories.some((territory) => territory === '*' || territory === 'KR')
  ) {
    reasons.push('rights-not-approved')
  }
  if (review.contentSha256 !== asset.contentSha256) reasons.push('review-content-mismatch')
  if (review.decision !== 'approved') reasons.push('review-not-approved')
  if (new Set(review.reviewedViewHashes).size < 3) reasons.push('insufficient-reviewed-views')
  const availableViewHashes = new Set(asset.reviewViews.map((view) => view.sha256))
  if (review.reviewedViewHashes.some((hash) => !availableViewHashes.has(hash))) {
    reasons.push('review-view-mismatch')
  }
  if (!review.visualOnlyAcknowledged) reasons.push('visualization-scope-required')
  if (!Number.isFinite(asset.inspection.silhouetteIou) || asset.inspection.silhouetteIou < 0.75) {
    reasons.push('silhouette-score-too-low')
  }
  if (
    asset.inspection.triangles <= 0 ||
    asset.inspection.triangles > 500_000 ||
    !isGeneratedMeshDimensionRatioAcceptable(
      measureGeneratedMeshGeometryQuality(product.dims, asset.inspection.bounds)
        .maxDimensionRatioError
    )
  ) {
    reasons.push('geometry-not-approved')
  }
  if (reasons.length > 0) return { published: false, reasons }
  return {
    published: true,
    asset: {
      assetId: `${product.id}-${asset.contentSha256.slice(0, 12)}`,
      productId: product.id,
      productFingerprint: fingerprint,
      uri: `/catalog/generated/${asset.contentSha256}.glb`,
      sha256: asset.contentSha256,
      byteLength: asset.byteLength,
      publishedAt: review.reviewedAt,
      visualOnly: true,
      generatorLabel: `${asset.generator.name} ${asset.generator.version}`,
    },
  }
}
