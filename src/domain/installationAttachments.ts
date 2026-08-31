import type { Placement } from './model'

export interface PlacementTransform {
  x: number
  z: number
  rotY: number
  roomId?: string
}

export function transformAttachmentTree(
  placements: Placement[],
  rootPlacementId: string,
  next: PlacementTransform
): Placement[] {
  const root = placements.find((placement) => placement.id === rootPlacementId)
  if (!root) return placements

  const attached = new Set([rootPlacementId])
  let found = true
  while (found) {
    found = false
    for (const placement of placements) {
      if (
        placement.supportPlacementId &&
        attached.has(placement.supportPlacementId) &&
        !attached.has(placement.id)
      ) {
        attached.add(placement.id)
        found = true
      }
    }
  }

  const radians = ((next.rotY - root.rotY) * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return placements.map((placement) => {
    if (!attached.has(placement.id)) return placement
    const dx = placement.pos.x - root.pos.x
    const dz = placement.pos.z - root.pos.z
    return {
      ...placement,
      pos: {
        ...placement.pos,
        x: Math.round(next.x + dx * cos - dz * sin),
        z: Math.round(next.z + dx * sin + dz * cos),
      },
      rotY: placement.rotY + next.rotY - root.rotY,
      roomId: next.roomId,
    }
  })
}
