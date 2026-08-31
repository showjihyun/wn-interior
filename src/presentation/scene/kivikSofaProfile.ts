export interface KivikSofaPart {
  role: 'frame' | 'arm' | 'seatCushion' | 'backShell' | 'backCushion' | 'foot'
  size: [number, number, number]
  position: [number, number, number]
}

export interface KivikSofaProfile {
  seatWidth: number
  seatDepth: number
  seatHeight: number
  armWidth: number
  seatCushionCount: number
  backCushionCount: number
  parts: KivikSofaPart[]
}

export function createKivikSofaProfile(dims: {
  w: number
  d: number
  h: number
}): KivikSofaProfile {
  const width = Math.max(1, dims.w)
  const depth = Math.max(1, dims.d)
  const height = Math.max(1, dims.h)
  const seatWidth = width * (1800 / 2280)
  const seatDepth = depth * (600 / 950)
  const seatHeight = height * (450 / 830)
  const armWidth = Math.max(1, (width - seatWidth) / 2)
  const footHeight = Math.max(1, height * 0.055)
  const armHeight = Math.max(1, height * 0.64)
  const cushionHeight = Math.max(1, height * 0.14)
  const cushionGap = Math.max(1, Math.min(width * 0.014, seatWidth * 0.08))
  const cushionWidth = Math.max(1, (seatWidth - cushionGap) / 2)
  const backShellDepth = Math.max(1, depth * 0.16)
  const backCushionDepth = Math.max(1, depth * 0.2)
  const backBottom = Math.max(1, seatHeight * 0.92)
  const backCushionHeight = Math.max(1, height - backBottom)
  const frontInset = Math.max(0, depth * 0.02)
  const frameDepth = Math.max(1, depth - backShellDepth - frontInset)
  const frameHeight = Math.max(1, seatHeight - cushionHeight - footHeight)
  const footSize = Math.max(1, Math.min(80, armWidth * 0.4, depth * 0.08))
  const cushionCenters = [-1, 1].map((side) => side * (cushionGap / 2 + cushionWidth / 2))
  const parts: KivikSofaPart[] = [
    {
      role: 'backShell',
      size: [seatWidth, Math.max(1, height * 0.72), backShellDepth],
      position: [0, footHeight, -depth / 2 + backShellDepth / 2],
    },
    {
      role: 'frame',
      size: [seatWidth, frameHeight, frameDepth],
      position: [0, footHeight, -depth / 2 + backShellDepth + frameDepth / 2],
    },
    ...([-1, 1] as const).map((side): KivikSofaPart => ({
      role: 'arm',
      size: [armWidth, armHeight, depth],
      position: [side * (width / 2 - armWidth / 2), footHeight, 0],
    })),
    ...cushionCenters.map((x): KivikSofaPart => ({
      role: 'seatCushion',
      size: [cushionWidth, cushionHeight, seatDepth],
      position: [x, seatHeight - cushionHeight, depth / 2 - frontInset - seatDepth / 2],
    })),
    ...cushionCenters.map((x): KivikSofaPart => ({
      role: 'backCushion',
      size: [cushionWidth, backCushionHeight, backCushionDepth],
      position: [x, backBottom, -depth / 2 + backShellDepth + backCushionDepth / 2],
    })),
    ...([-1, 1] as const).flatMap((sideX) =>
      ([-1, 1] as const).map((sideZ): KivikSofaPart => ({
        role: 'foot',
        size: [footSize, footHeight, footSize],
        position: [sideX * (width / 2 - armWidth / 2), 0, sideZ * (depth / 2 - footSize / 2)],
      }))
    ),
  ]
  return {
    seatWidth,
    seatDepth,
    seatHeight,
    armWidth,
    seatCushionCount: 2,
    backCushionCount: 2,
    parts,
  }
}
