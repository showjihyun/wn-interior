import type { Product } from '../../domain/model'

interface Point3 {
  x: number
  y: number
  z: number
}

export interface MeshBounds {
  min: Point3
  max: Point3
}

export interface ContainedMeshTransform {
  scale: number
  position: Point3
  fittedDims: Product['dims']
}

export function calculateContainedMeshTransform(
  bounds: MeshBounds,
  target: Product['dims']
): ContainedMeshTransform | null {
  const values = [
    bounds.min.x,
    bounds.min.y,
    bounds.min.z,
    bounds.max.x,
    bounds.max.y,
    bounds.max.z,
    target.w,
    target.d,
    target.h,
  ]
  if (!values.every(Number.isFinite) || target.w <= 0 || target.d <= 0 || target.h <= 0) {
    return null
  }
  const source = {
    w: bounds.max.x - bounds.min.x,
    d: bounds.max.z - bounds.min.z,
    h: bounds.max.y - bounds.min.y,
  }
  if (source.w <= 0 || source.d <= 0 || source.h <= 0) return null
  const scale = Math.min(target.w / source.w, target.d / source.d, target.h / source.h)
  if (!Number.isFinite(scale) || scale <= 0) return null
  return {
    scale,
    position: {
      x: cleanZero(-((bounds.min.x + bounds.max.x) / 2) * scale),
      y: -bounds.min.y * scale,
      z: cleanZero(-((bounds.min.z + bounds.max.z) / 2) * scale),
    },
    fittedDims: {
      w: source.w * scale,
      d: source.d * scale,
      h: source.h * scale,
    },
  }
}

export function calculateExactEnvelopeMeshTransform(
  bounds: MeshBounds,
  target: Product['dims']
): {
  scale: Point3
  position: Point3
  fittedDims: Product['dims']
  axisStretchRatio: number
} | null {
  const source = {
    w: bounds.max.x - bounds.min.x,
    d: bounds.max.z - bounds.min.z,
    h: bounds.max.y - bounds.min.y,
  }
  const values = [
    bounds.min.x,
    bounds.min.y,
    bounds.min.z,
    bounds.max.x,
    bounds.max.y,
    bounds.max.z,
    source.w,
    source.d,
    source.h,
    target.w,
    target.d,
    target.h,
  ]
  if (!values.every(Number.isFinite) || values.slice(6).some((value) => value <= 0)) return null
  const scale = {
    x: target.w / source.w,
    y: target.h / source.h,
    z: target.d / source.d,
  }
  const scaleValues = [scale.x, scale.y, scale.z]
  return {
    scale,
    position: {
      x: cleanZero(-((bounds.min.x + bounds.max.x) / 2) * scale.x),
      y: -bounds.min.y * scale.y,
      z: cleanZero(-((bounds.min.z + bounds.max.z) / 2) * scale.z),
    },
    fittedDims: { ...target },
    axisStretchRatio: Math.max(...scaleValues) / Math.min(...scaleValues),
  }
}

const cleanZero = (value: number) => (Object.is(value, -0) ? 0 : value)
