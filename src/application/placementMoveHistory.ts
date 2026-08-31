import type { FloorPlan, Placement, Product } from '../domain/model'

export interface EditorSnapshot {
  plan: FloorPlan
  placements: Placement[]
  customProducts: Product[]
}

export interface PlacementMoveOrigin {
  x: number
  z: number
  rotY: number
  roomId?: string
}

export interface PlacementMoveTransaction {
  id: string
  origin: PlacementMoveOrigin
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
    pos: { ...placement.pos, x: origin.x, z: origin.z },
    rotY: origin.rotY,
    roomId: origin.roomId,
  }
}

export function restorePlacementMove(
  placements: Placement[],
  transaction: PlacementMoveTransaction
): Placement[] {
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
  const changed =
    placement.pos.x !== origin.x ||
    placement.pos.z !== origin.z ||
    placement.rotY !== origin.rotY ||
    placement.roomId !== origin.roomId
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
