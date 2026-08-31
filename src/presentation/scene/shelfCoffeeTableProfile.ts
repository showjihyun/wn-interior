export interface ShelfCoffeeTablePart {
  role: 'top' | 'shelf' | 'leg'
  size: [number, number, number]
  position: [number, number, number]
}

export interface ShelfCoffeeTableProfile {
  shelfCount: number
  legCount: number
  parts: ShelfCoffeeTablePart[]
}

export function createShelfCoffeeTableProfile(dims: {
  w: number
  d: number
  h: number
}): ShelfCoffeeTableProfile {
  const width = Math.max(1, dims.w)
  const depth = Math.max(1, dims.d)
  const height = Math.max(1, dims.h)
  const topThickness = Math.max(1, Math.min(height / 3, height * 0.12))
  const legHeight = Math.max(1, height - topThickness)
  const legSize = Math.max(1, Math.min(55, width / 4, depth / 4))
  const shelfThickness = Math.max(1, Math.min(height / 6, height * 0.06))
  const shelfBottom = Math.max(1, Math.min(legHeight * 0.38, legHeight - shelfThickness))
  const parts: ShelfCoffeeTablePart[] = [
    {
      role: 'top',
      size: [width, topThickness, depth],
      position: [0, height - topThickness, 0],
    },
    {
      role: 'shelf',
      size: [Math.max(1, width - legSize * 2), shelfThickness, Math.max(1, depth - legSize * 2)],
      position: [0, shelfBottom, 0],
    },
    ...([-1, 1] as const).flatMap((sideX) =>
      ([-1, 1] as const).map((sideZ): ShelfCoffeeTablePart => ({
        role: 'leg',
        size: [legSize, legHeight, legSize],
        position: [sideX * (width / 2 - legSize / 2), 0, sideZ * (depth / 2 - legSize / 2)],
      }))
    ),
  ]
  return { shelfCount: 1, legCount: 4, parts }
}
