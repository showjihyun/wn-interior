export interface HighBedFramePart {
  role: 'headboard' | 'footboard' | 'sideRail' | 'midbeam'
  size: [number, number, number]
  position: [number, number, number]
}

export interface HighBedFrameProfile {
  includesMattress: boolean
  includesSlattedBase: boolean
  midbeamIncluded: boolean
  parts: HighBedFramePart[]
}

export function createHighBedFrameProfile(
  dims: { w: number; d: number; h: number },
  options: { footboardHeight: number; clearance: number }
): HighBedFrameProfile {
  const width = Math.max(1, dims.w)
  const depth = Math.max(1, dims.d)
  const height = Math.max(1, dims.h)
  const boardDepth = Math.max(1, Math.min(depth / 4, depth * 0.04))
  const footboardHeight = Math.max(1, Math.min(height, options.footboardHeight))
  const clearance = Math.max(0, Math.min(footboardHeight * 0.8, options.clearance))
  const railHeight = Math.max(1, footboardHeight - clearance)
  const railWidth = Math.max(1, Math.min(width / 4, width * 0.05))
  const innerDepth = Math.max(1, depth - boardDepth * 2)
  const railCenterZ = 0
  const parts: HighBedFramePart[] = [
    {
      role: 'headboard',
      size: [width, height, boardDepth],
      position: [0, 0, -depth / 2 + boardDepth / 2],
    },
    {
      role: 'footboard',
      size: [width, footboardHeight, boardDepth],
      position: [0, 0, depth / 2 - boardDepth / 2],
    },
    ...([-1, 1] as const).map((side): HighBedFramePart => ({
      role: 'sideRail',
      size: [railWidth, railHeight, innerDepth],
      position: [side * (width / 2 - railWidth / 2), clearance, railCenterZ],
    })),
    {
      role: 'midbeam',
      size: [Math.max(1, width * 0.025), Math.max(1, railHeight * 0.45), innerDepth],
      position: [0, clearance, railCenterZ],
    },
  ]
  return {
    includesMattress: false,
    includesSlattedBase: false,
    midbeamIncluded: true,
    parts,
  }
}
