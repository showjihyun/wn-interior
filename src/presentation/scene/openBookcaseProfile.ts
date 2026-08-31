export interface OpenBookcasePart {
  role: 'side' | 'top' | 'bottom' | 'back' | 'shelf'
  size: [number, number, number]
  position: [number, number, number]
}

export interface OpenBookcaseProfile {
  shelfCount: number
  parts: OpenBookcasePart[]
}

export function createOpenBookcaseProfile(dims: {
  w: number
  d: number
  h: number
}): OpenBookcaseProfile {
  const width = Math.max(1, dims.w)
  const depth = Math.max(1, dims.d)
  const height = Math.max(1, dims.h)
  const shelfCount = 5
  const sideThickness = Math.min(Math.max(2, width * 0.025), width * 0.2)
  const topBottomThickness = Math.min(Math.max(2, height * 0.012), height * 0.08)
  const backThickness = Math.min(Math.max(1, depth * 0.03), depth * 0.2)
  const shelfThickness = Math.min(Math.max(1, height * 0.01), height / (shelfCount * 4))
  const interiorWidth = Math.max(1, width - sideThickness * 2)
  const interiorHeight = Math.max(1, height - topBottomThickness * 2)
  const shelfDepth = Math.max(1, depth - backThickness)
  const shelfCenterZ = backThickness / 2
  const parts: OpenBookcasePart[] = [
    {
      role: 'side',
      size: [sideThickness, height, depth],
      position: [-width / 2 + sideThickness / 2, 0, 0],
    },
    {
      role: 'side',
      size: [sideThickness, height, depth],
      position: [width / 2 - sideThickness / 2, 0, 0],
    },
    {
      role: 'bottom',
      size: [interiorWidth, topBottomThickness, depth],
      position: [0, 0, 0],
    },
    {
      role: 'top',
      size: [interiorWidth, topBottomThickness, depth],
      position: [0, height - topBottomThickness, 0],
    },
    {
      role: 'back',
      size: [interiorWidth, interiorHeight, backThickness],
      position: [0, topBottomThickness, -depth / 2 + backThickness / 2],
    },
  ]
  for (let index = 0; index < shelfCount; index++) {
    const centerY = topBottomThickness + (interiorHeight * (index + 1)) / (shelfCount + 1)
    parts.push({
      role: 'shelf',
      size: [interiorWidth, shelfThickness, shelfDepth],
      position: [0, centerY - shelfThickness / 2, shelfCenterZ],
    })
  }
  return { shelfCount, parts }
}
