export interface ModularWardrobePart {
  role: 'frame' | 'door' | 'plinth'
  size: [number, number, number]
  position: [number, number, number]
}

export interface ModularWardrobeProfile {
  frameCount: number
  doorCount: number
  handlesIncluded: boolean
  parts: ModularWardrobePart[]
}

export function createModularWardrobeProfile(
  dims: { w: number; d: number; h: number },
  options: { frameCount: number; doorCount: number; doorHeight: number }
): ModularWardrobeProfile {
  const width = Math.max(1, dims.w)
  const depth = Math.max(1, dims.d)
  const height = Math.max(1, dims.h)
  const frameCount = Math.max(1, Math.round(options.frameCount) || 1)
  const doorCount = Math.max(1, Math.round(options.doorCount) || 1)
  const frameWidth = width / frameCount
  const doorGap = Math.min(Math.max(1, width * 0.002), width / (doorCount * 4))
  const doorWidth = Math.max(1, width / doorCount - doorGap)
  const doorHeight = Math.min(
    height,
    Math.max(1, Number.isFinite(options.doorHeight) ? options.doorHeight : height * 0.97)
  )
  const doorDepth = Math.min(Math.max(2, depth * 0.03), depth * 0.2)
  const parts: ModularWardrobePart[] = []
  for (let index = 0; index < frameCount; index++) {
    parts.push({
      role: 'frame',
      size: [frameWidth, height, depth],
      position: [-width / 2 + frameWidth * (index + 0.5), 0, 0],
    })
  }
  for (let index = 0; index < doorCount; index++) {
    parts.push({
      role: 'door',
      size: [doorWidth, doorHeight, doorDepth],
      position: [
        -width / 2 + (width / doorCount) * (index + 0.5),
        (height - doorHeight) / 2,
        depth / 2 - doorDepth / 2,
      ],
    })
  }
  parts.push({
    role: 'plinth',
    size: [width, Math.max(1, height * 0.035), Math.max(1, depth * 0.88)],
    position: [0, 0, -depth * 0.03],
  })
  return { frameCount, doorCount, handlesIncluded: false, parts }
}
