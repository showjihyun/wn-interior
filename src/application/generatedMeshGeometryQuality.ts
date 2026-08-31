export const MAX_GENERATED_MESH_DIMENSION_RATIO_ERROR = 0.05
const DIMENSION_RATIO_FLOAT_TOLERANCE = 1e-12

export interface DimensionEnvelope {
  w: number
  d: number
  h: number
}

export interface GeneratedMeshGeometryQuality {
  validBounds: boolean
  axisStretchRatio: number
  maxDimensionRatioError: number
}

export function measureGeneratedMeshGeometryQuality(
  target: DimensionEnvelope,
  candidate: DimensionEnvelope
): GeneratedMeshGeometryQuality {
  const validBounds = [candidate.w, candidate.d, candidate.h].every(
    (value) => Number.isFinite(value) && value > 0
  )
  if (!validBounds) {
    return {
      validBounds: false,
      axisStretchRatio: Number.POSITIVE_INFINITY,
      maxDimensionRatioError: Number.POSITIVE_INFINITY,
    }
  }

  const scales = [target.w / candidate.w, target.d / candidate.d, target.h / candidate.h]
  const axisStretchRatio = Math.max(...scales) / Math.min(...scales)
  const targetWidthHeight = target.w / target.h
  const targetDepthHeight = target.d / target.h
  const candidateWidthHeight = candidate.w / candidate.h
  const candidateDepthHeight = candidate.d / candidate.h
  const maxDimensionRatioError = Math.max(
    Math.abs(candidateWidthHeight / targetWidthHeight - 1),
    Math.abs(candidateDepthHeight / targetDepthHeight - 1)
  )
  return { validBounds: true, axisStretchRatio, maxDimensionRatioError }
}

export function isGeneratedMeshDimensionRatioAcceptable(error: number): boolean {
  return (
    Number.isFinite(error) &&
    error <= MAX_GENERATED_MESH_DIMENSION_RATIO_ERROR + DIMENSION_RATIO_FLOAT_TOLERANCE
  )
}
