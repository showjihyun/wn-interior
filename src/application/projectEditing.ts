import type { Opening, Placement, Product, Room, Wall } from '../domain/model'
import type { EditorSnapshot, PlacementMoveHistoryState } from './placementMoveHistory'

export type ProjectEdit =
  | { type: 'add-placement'; placement: Placement }
  | { type: 'update-placement'; id: string; patch: Partial<Placement> }
  | { type: 'remove-placement'; id: string }
  | { type: 'duplicate-placement'; sourceId: string; placementId: string }
  | { type: 'replace-placements'; placements: Placement[] }
  | {
      type: 'set-room-material'
      roomId: string
      kind: 'floorMaterialId' | 'wallMaterialId'
      materialId: string
    }
  | { type: 'rename-room'; roomId: string; name: string }
  | { type: 'add-wall'; wall: Wall }
  | { type: 'update-wall'; wallId: string; patch: Partial<Wall> }
  | { type: 'remove-wall'; wallId: string }
  | { type: 'add-opening'; opening: Opening }
  | { type: 'update-opening'; openingId: string; patch: Partial<Opening> }
  | { type: 'remove-opening'; openingId: string }
  | { type: 'set-wall-height'; height: number }
  | { type: 'add-custom-product'; product: Product }

const clonePlacement = (placement: Placement): Placement => ({
  ...placement,
  pos: { ...placement.pos },
  dimsOverride: placement.dimsOverride ? { ...placement.dimsOverride } : undefined,
})

export function cloneEditorSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    plan: {
      ...snapshot.plan,
      walls: snapshot.plan.walls.map((wall) => ({
        ...wall,
        a: { ...wall.a },
        b: { ...wall.b },
      })),
      openings: snapshot.plan.openings.map((opening) => ({ ...opening })),
      rooms: snapshot.plan.rooms.map((room: Room) => ({
        ...room,
        polygon: room.polygon.map((point) => ({ ...point })),
      })),
    },
    placements: snapshot.placements.map(clonePlacement),
    customProducts: snapshot.customProducts.map((product) => ({
      ...product,
      dims: { ...product.dims },
      colorways: product.colorways ? [...product.colorways] : undefined,
      retail: product.retail
        ? {
            ...product.retail,
            included: [...product.retail.included],
            excluded: [...product.retail.excluded],
          }
        : undefined,
      appearance: product.appearance ? { ...product.appearance } : undefined,
      dimensionVariants: product.dimensionVariants?.map((variant) => ({
        ...variant,
        dims: { ...variant.dims },
      })),
    })),
  }
}

export function executeProjectEdit(
  state: PlacementMoveHistoryState,
  edit: ProjectEdit
): PlacementMoveHistoryState {
  const before: EditorSnapshot = {
    plan: state.plan,
    placements: state.placements,
    customProducts: state.customProducts,
  }
  const next = cloneEditorSnapshot(before)

  switch (edit.type) {
    case 'add-placement':
      next.placements.push(clonePlacement(edit.placement))
      break
    case 'update-placement': {
      const index = next.placements.findIndex((placement) => placement.id === edit.id)
      if (index >= 0) next.placements[index] = { ...next.placements[index], ...edit.patch }
      break
    }
    case 'remove-placement':
      next.placements = next.placements.filter((placement) => placement.id !== edit.id)
      break
    case 'duplicate-placement': {
      const source = next.placements.find((placement) => placement.id === edit.sourceId)
      if (source) {
        next.placements.push({
          ...source,
          id: edit.placementId,
          pos: { ...source.pos, x: source.pos.x + 300 },
        })
      }
      break
    }
    case 'replace-placements':
      next.placements = edit.placements.map(clonePlacement)
      break
    case 'set-room-material': {
      const room = next.plan.rooms.find((candidate) => candidate.id === edit.roomId)
      if (room) room[edit.kind] = edit.materialId
      break
    }
    case 'rename-room': {
      const room = next.plan.rooms.find((candidate) => candidate.id === edit.roomId)
      if (room) room.name = edit.name
      break
    }
    case 'add-wall':
      next.plan.walls.push(edit.wall)
      break
    case 'update-wall': {
      const wall = next.plan.walls.find((candidate) => candidate.id === edit.wallId)
      if (wall) Object.assign(wall, edit.patch)
      break
    }
    case 'remove-wall':
      next.plan.walls = next.plan.walls.filter((wall) => wall.id !== edit.wallId)
      next.plan.openings = next.plan.openings.filter((opening) => opening.wallId !== edit.wallId)
      break
    case 'add-opening':
      next.plan.openings.push(edit.opening)
      break
    case 'update-opening': {
      const opening = next.plan.openings.find((candidate) => candidate.id === edit.openingId)
      if (opening) Object.assign(opening, edit.patch)
      break
    }
    case 'remove-opening':
      next.plan.openings = next.plan.openings.filter((opening) => opening.id !== edit.openingId)
      break
    case 'set-wall-height':
      next.plan.wallHeight = edit.height
      break
    case 'add-custom-product':
      next.customProducts.push(edit.product)
      break
  }

  return {
    ...next,
    past: [...state.past.slice(-59), before],
    future: [],
  }
}

export function undoProjectEdit(
  state: PlacementMoveHistoryState
): PlacementMoveHistoryState | null {
  const previous = state.past[state.past.length - 1]
  if (!previous) return null
  const current = {
    plan: state.plan,
    placements: state.placements,
    customProducts: state.customProducts,
  }
  return {
    ...previous,
    past: state.past.slice(0, -1),
    future: [current, ...state.future.slice(0, 59)],
  }
}

export function redoProjectEdit(
  state: PlacementMoveHistoryState
): PlacementMoveHistoryState | null {
  const following = state.future[0]
  if (!following) return null
  const current = {
    plan: state.plan,
    placements: state.placements,
    customProducts: state.customProducts,
  }
  return {
    ...following,
    past: [...state.past.slice(-59), current],
    future: state.future.slice(1),
  }
}
