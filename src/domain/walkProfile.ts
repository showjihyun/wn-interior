export const WALK_EYE_RATIO = 0.94
export const WALK_RADIUS_BASE = 110
export const WALK_SPEED = 1600
export const WALK_RUN = 4200

export function characterRadius(weightKg: number): number {
  return Math.max(100, Math.min(220, WALK_RADIUS_BASE + (weightKg - 60) * 1.2))
}
