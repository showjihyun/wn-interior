import {
  isGeneratedMeshDimensionRatioAcceptable,
  measureGeneratedMeshGeometryQuality,
  type DimensionEnvelope,
} from './generatedMeshGeometryQuality'

export interface MultiviewSourceObservation {
  id: string
  viewpoint: string
  sameVariant: boolean
  wholeProductVisible: boolean
  independentGeometryEvidence: boolean
}

export interface MultiviewModelCandidate {
  name: string
  supportsMultipleImages: boolean
  licenseUsableInKr: boolean
  minimumVramMiB: number
}

export interface MultiviewExperimentEnvironment {
  gpuVramMiB: number
  minimumDistinctViews: number
}

export interface MeshBenchmarkCandidate {
  name: string
  bounds: DimensionEnvelope
  triangles: number
  byteLength: number
}

export interface MultiviewRegenerationCandidate extends MeshBenchmarkCandidate {
  id: string
  viewpoint: string
  sourceImageSha256: string
  silhouetteIou: number
  sameVariant?: boolean
  wholeProductVisible?: boolean
  independentGeometryEvidence?: boolean
}

export interface MultiviewRegenerationAssessment extends MultiviewRegenerationCandidate {
  axisStretchRatio: number
  maxDimensionRatioError: number
  passesDimensionRatioGate: boolean
  passesSilhouetteGate: boolean
  passesSourceEvidenceGate: boolean
}

export interface MultiviewRegenerationSelection {
  status: 'gate-passed' | 'rejected'
  selectedCandidateId?: string
  bestAttemptId?: string
  reasons: string[]
  candidates: MultiviewRegenerationAssessment[]
}

export function selectMultiviewRegenerationCandidate(
  target: DimensionEnvelope,
  candidates: readonly MultiviewRegenerationCandidate[],
  minimumSilhouetteIou = 0.75
): MultiviewRegenerationSelection {
  const assessments = candidates.map((candidate): MultiviewRegenerationAssessment => {
    const quality = measureGeneratedMeshGeometryQuality(target, candidate.bounds)
    return {
      ...candidate,
      axisStretchRatio: quality.axisStretchRatio,
      maxDimensionRatioError: quality.maxDimensionRatioError,
      passesDimensionRatioGate: isGeneratedMeshDimensionRatioAcceptable(
        quality.maxDimensionRatioError
      ),
      passesSilhouetteGate:
        Number.isFinite(candidate.silhouetteIou) && candidate.silhouetteIou >= minimumSilhouetteIou,
      passesSourceEvidenceGate:
        candidate.sameVariant !== false &&
        candidate.wholeProductVisible !== false &&
        candidate.independentGeometryEvidence !== false,
    }
  })
  const ranked = [...assessments].sort(
    (left, right) =>
      Number(right.passesSourceEvidenceGate) - Number(left.passesSourceEvidenceGate) ||
      left.maxDimensionRatioError - right.maxDimensionRatioError ||
      right.silhouetteIou - left.silhouetteIou ||
      left.byteLength - right.byteLength ||
      left.id.localeCompare(right.id)
  )
  const eligible = ranked.filter(
    (candidate) =>
      candidate.passesSourceEvidenceGate &&
      candidate.passesDimensionRatioGate &&
      candidate.passesSilhouetteGate
  )
  if (eligible.length > 0) {
    return {
      status: 'gate-passed',
      selectedCandidateId: eligible[0].id,
      bestAttemptId: eligible[0].id,
      reasons: [],
      candidates: assessments,
    }
  }
  const reasons: string[] = []
  if (assessments.length === 0) reasons.push('no-regeneration-candidates')
  const sourceEligible = assessments.filter((candidate) => candidate.passesSourceEvidenceGate)
  if (assessments.length > 0 && sourceEligible.length === 0) {
    reasons.push('source-evidence-gate-failed')
  }
  if (
    sourceEligible.length > 0 &&
    !sourceEligible.some((candidate) => candidate.passesDimensionRatioGate)
  ) {
    reasons.push('dimension-ratio-gate-failed')
  }
  if (
    sourceEligible.length > 0 &&
    !sourceEligible.some((candidate) => candidate.passesSilhouetteGate)
  ) {
    reasons.push('silhouette-gate-failed')
  }
  if (
    sourceEligible.some((candidate) => candidate.passesDimensionRatioGate) &&
    sourceEligible.some((candidate) => candidate.passesSilhouetteGate)
  ) {
    reasons.push('no-candidate-passes-all-gates')
  }
  return {
    status: 'rejected',
    bestAttemptId: ranked[0]?.id,
    reasons,
    candidates: assessments,
  }
}

export function assessMultiviewExperimentReadiness(
  sources: readonly MultiviewSourceObservation[],
  model: MultiviewModelCandidate,
  environment: MultiviewExperimentEnvironment
): {
  status: 'ready' | 'blocked'
  usableDistinctViews: number
  reasons: string[]
} {
  const usableViewpoints = new Set(
    sources
      .filter(
        (source) =>
          source.sameVariant && source.wholeProductVisible && source.independentGeometryEvidence
      )
      .map((source) => source.viewpoint)
  )
  const reasons: string[] = []
  if (usableViewpoints.size < environment.minimumDistinctViews) {
    reasons.push('insufficient-distinct-product-views')
  }
  if (!model.supportsMultipleImages) reasons.push('model-not-multiview')
  if (!model.licenseUsableInKr) reasons.push('model-license-not-usable-in-kr')
  if (environment.gpuVramMiB < model.minimumVramMiB) reasons.push('insufficient-gpu-vram')
  return {
    status: reasons.length === 0 ? 'ready' : 'blocked',
    usableDistinctViews: usableViewpoints.size,
    reasons,
  }
}

export function compareMeshBenchmarkCandidates(
  target: DimensionEnvelope,
  candidates: readonly MeshBenchmarkCandidate[]
): Array<
  MeshBenchmarkCandidate & {
    maxDimensionRatioError: number
    passesDimensionRatioGate: boolean
  }
> {
  return candidates.map((candidate) => {
    const quality = measureGeneratedMeshGeometryQuality(target, candidate.bounds)
    return {
      ...candidate,
      maxDimensionRatioError: quality.maxDimensionRatioError,
      passesDimensionRatioGate: isGeneratedMeshDimensionRatioAcceptable(
        quality.maxDimensionRatioError
      ),
    }
  })
}
