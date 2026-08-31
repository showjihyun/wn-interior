import type { FloorPlan, Pt } from './model'

export interface PlanBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  depth: number
  center: Pt
}

export function getPlanBounds(plan: FloorPlan): PlanBounds | null {
  const points = [
    ...plan.walls.flatMap((wall) => [wall.a, wall.b]),
    ...plan.rooms.flatMap((room) => room.polygon),
  ]
  if (points.length === 0) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    depth: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  }
}

export function getPlanCenter(plan: FloorPlan): Pt {
  return getPlanBounds(plan)?.center ?? { x: 0, y: 0 }
}
