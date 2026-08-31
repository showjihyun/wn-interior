export interface GatelegTablePart {
  role: 'centerTop' | 'openLeaf' | 'foldedLeaf' | 'cabinet' | 'gateLeg' | 'drawer'
  size: [number, number, number]
  position: [number, number, number]
}

export interface GatelegTableProfile {
  collapsedLength: number
  normalLength: number
  expandedLength: number
  parts: GatelegTablePart[]
}

export function createGatelegTableProfile(
  dims: { w: number; d: number; h: number },
  options: { collapsedLength: number; expandedLength: number }
): GatelegTableProfile {
  const normalLength = Math.max(1, dims.w)
  const depth = Math.max(1, dims.d)
  const height = Math.max(1, dims.h)
  const requestedCollapsed = Number.isFinite(options.collapsedLength)
    ? options.collapsedLength
    : normalLength * 0.3
  const collapsedLength = Math.min(Math.max(1, requestedCollapsed), normalLength)
  const expandedLength = Math.max(
    normalLength,
    collapsedLength,
    Number.isFinite(options.expandedLength) ? options.expandedLength : normalLength
  )
  const topThickness = Math.min(Math.max(2, height * 0.055), height * 0.18)
  const leafLength = Math.max(1, (expandedLength - collapsedLength) / 2)
  const stateTolerance = 1e-6
  const openLeafCount =
    normalLength <= collapsedLength + stateTolerance
      ? 0
      : normalLength >= expandedLength - stateTolerance
        ? 2
        : 1
  const foldedLeafHeight = Math.min(leafLength, Math.max(1, height - topThickness))
  const minimumX = -normalLength / 2
  const centerX = openLeafCount === 1 ? minimumX + collapsedLength / 2 : 0
  const frameHeight = Math.max(1, height - topThickness)
  const gateThickness = Math.min(
    Math.max(2, Math.min(normalLength, depth) * 0.045),
    Math.max(2, leafLength * 0.24)
  )
  const cabinetDepth = Math.max(1, depth * 0.38)
  const cabinetWidth = Math.max(1, collapsedLength * 0.76)
  const drawerGap = Math.max(1, frameHeight * 0.012)
  const drawerHeight = Math.max(1, (frameHeight - drawerGap * 5) / 4)
  const parts: GatelegTablePart[] = [
    {
      role: 'centerTop',
      size: [collapsedLength, topThickness, depth],
      position: [centerX, height - topThickness, 0],
    },
    {
      role: 'cabinet',
      size: [cabinetWidth, frameHeight, cabinetDepth],
      position: [centerX, 0, 0],
    },
  ]

  const openLeafCenters: number[] = []
  if (openLeafCount === 1) {
    const openLeafLength = Math.max(1, normalLength - collapsedLength)
    const openLeafX = minimumX + collapsedLength + openLeafLength / 2
    parts.push({
      role: 'openLeaf',
      size: [openLeafLength, topThickness, depth],
      position: [openLeafX, height - topThickness, 0],
    })
    openLeafCenters.push(openLeafX)
  } else if (openLeafCount === 2) {
    const openLeafLength = Math.max(1, (normalLength - collapsedLength) / 2)
    for (const side of [-1, 1]) {
      const openLeafX = side * (collapsedLength / 2 + openLeafLength / 2)
      parts.push({
        role: 'openLeaf',
        size: [openLeafLength, topThickness, depth],
        position: [openLeafX, height - topThickness, 0],
      })
      openLeafCenters.push(openLeafX)
    }
  }

  const foldedSides = openLeafCount === 0 ? [-1, 1] : openLeafCount === 1 ? [-1] : ([] as number[])
  for (const side of foldedSides) {
    parts.push({
      role: 'foldedLeaf',
      size: [topThickness, foldedLeafHeight, depth],
      position: [
        centerX + side * (collapsedLength / 2 - topThickness / 2),
        height - topThickness - foldedLeafHeight,
        0,
      ],
    })
  }

  for (const openLeafX of openLeafCenters) {
    for (const zSign of [-1, 1]) {
      parts.push({
        role: 'gateLeg',
        size: [gateThickness, frameHeight, gateThickness],
        position: [openLeafX, 0, zSign * (depth / 2 - gateThickness)],
      })
    }
  }
  for (let index = 0; index < 4; index++) {
    parts.push({
      role: 'drawer',
      size: [cabinetWidth * 0.82, drawerHeight, Math.max(1, gateThickness * 0.55)],
      position: [
        centerX,
        drawerGap + index * (drawerHeight + drawerGap),
        cabinetDepth / 2 + gateThickness * 0.275,
      ],
    })
  }
  return { collapsedLength, normalLength, expandedLength, parts }
}
