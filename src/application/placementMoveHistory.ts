import type { FloorPlan, Placement, Product } from '../domain/model'

export interface EditorSnapshot {
  plan: FloorPlan
  placements: Placement[]
  customProducts: Product[]
}

export interface PlacementMoveOrigin {
  x: number
  y?: number
  z: number
  rotY: number
  roomId?: string
  elevationOverride?: number
  supportPlacementId?: string
}

export interface PlacementMoveTransaction {
  id: string
  origin: PlacementMoveOrigin
  originPlacements?: Placement[]
}

export interface PlacementMoveHistoryState extends EditorSnapshot {
  past: EditorSnapshot[]
  future: EditorSnapshot[]
}

export interface PlacementMoveCommit {
  past: EditorSnapshot[]
  future: EditorSnapshot[]
}

function placementAtOrigin(placement: Placement, origin: PlacementMoveOrigin): Placement {
  return {
    ...placement,
    pos: { ...placement.pos, x: origin.x, y: origin.y ?? placement.pos.y, z: origin.z },
    rotY: origin.rotY,
    roomId: origin.roomId,
    elevationOverride: origin.elevationOverride,
    supportPlacementId: origin.supportPlacementId,
  }
}

const clonePlacement = (placement: Placement): Placement => ({
  ...placement,
  pos: { ...placement.pos },
  dimsOverride: placement.dimsOverride ? { ...placement.dimsOverride } : undefined,
})

export function restorePlacementMove(
  placements: Placement[],
  transaction: PlacementMoveTransaction
): Placement[] {
  if (transaction.originPlacements) return transaction.originPlacements.map(clonePlacement)
  return placements.map((placement) =>
    placement.id === transaction.id ? placementAtOrigin(placement, transaction.origin) : placement
  )
}

/**
 * Transient drag has already updated the current placement. Build the history entry from the
 * recorded origin instead of snapshotting that transient position.
 */
export function commitPlacementMove(
  state: PlacementMoveHistoryState,
  transaction: PlacementMoveTransaction
): PlacementMoveCommit | null {
  const placement = state.placements.find((item) => item.id === transaction.id)
  if (!placement) return null

  const origin = transaction.origin
  const originalPlacement = transaction.originPlacements?.find((item) => item.id === transaction.id)
  const changed =
    originalPlacement !== undefined
      ? JSON.stringify(placement) !== JSON.stringify(originalPlacement)
      : placement.pos.x !== origin.x ||
        placement.pos.y !== (origin.y ?? placement.pos.y) ||
        placement.pos.z !== origin.z ||
        placement.rotY !== origin.rotY ||
        placement.roomId !== origin.roomId ||
        placement.elevationOverride !== origin.elevationOverride ||
        placement.supportPlacementId !== origin.supportPlacementId
  if (!changed) return null

  const before: EditorSnapshot = {
    plan: state.plan,
    placements: restorePlacementMove(state.placements, transaction),
    customProducts: state.customProducts,
  }
  return {
    past: [...state.past.slice(-59), before],
    future: [],
  }
}
