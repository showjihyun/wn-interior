export interface TableGlobeLampProfile {
  base: { radius: number; height: number; centerY: number }
  globe: { radiusX: number; radiusY: number; radiusZ: number; centerY: number }
}

export function createTableGlobeLampProfile(dims: {
  w: number
  d: number
  h: number
}): TableGlobeLampProfile {
  const width = Math.max(1, dims.w)
  const depth = Math.max(1, dims.d)
  const height = Math.max(1, dims.h)
  const baseHeight = Math.max(1, height * 0.12)
  const globeHeight = Math.max(1, height - baseHeight)
  return {
    base: {
      radius: Math.max(1, Math.min(width, depth) * 0.22),
      height: baseHeight,
      centerY: baseHeight / 2,
    },
    globe: {
      radiusX: width / 2,
      radiusY: globeHeight / 2,
      radiusZ: depth / 2,
      centerY: baseHeight + globeHeight / 2,
    },
  }
}
