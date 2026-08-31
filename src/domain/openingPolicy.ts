import type { FloorPlan, Opening, OpeningType, Pt } from './model'
import { nearestWall, wallLength } from './engine/geom'

const DEFAULT_OPENING: Record<OpeningType, Pick<Opening, 'width' | 'height' | 'sill'>> = {
  door: { width: 800, height: 2050, sill: 0 },
  entry: { width: 1100, height: 2100, sill: 0 },
  window: { width: 1500, height: 1500, sill: 900 },
}

export function createOpeningOnNearestWall(
  plan: FloorPlan,
  point: Pt,
  type: OpeningType,
  maximumSnapDistance = 800
): Omit<Opening, 'id'> | null {
  const snap = nearestWall(plan, point, maximumSnapDistance)
  if (!snap) return null
  const dimensions = DEFAULT_OPENING[type]
  const wall = plan.walls.find((candidate) => candidate.id === snap.wallId)
  if (!wall) return null
  const maximumOffset = Math.max(0, wallLength(wall) - dimensions.width)
  return {
    wallId: snap.wallId,
    type,
    offset: Math.max(0, Math.min(maximumOffset, snap.offset - dimensions.width / 2)),
    ...dimensions,
  }
}
