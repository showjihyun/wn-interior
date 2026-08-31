import type { Placement, Product } from './model'
import { resolveDims } from './engine/dims'
import { aabbOverlap, footprintAABB } from './engine/geom'

export function computePlacementConflicts(
  placements: Placement[],
  productOf: (id: string) => Product | undefined
): Set<string> {
  const items = placements
    .map((placement) => {
      const product = productOf(placement.productId)
      if (!product || product.mount === 'wall-mount' || product.mount === 'ceiling') return null
      const dimensions = resolveDims(product, placement)
      return {
        id: placement.id,
        box: footprintAABB(
          dimensions.w,
          dimensions.d,
          placement.pos.x,
          placement.pos.z,
          placement.rotY
        ),
      }
    })
    .filter(Boolean) as { id: string; box: ReturnType<typeof footprintAABB> }[]
  const conflicts = new Set<string>()
  for (let left = 0; left < items.length; left++) {
    for (let right = left + 1; right < items.length; right++) {
      if (!aabbOverlap(items[left].box, items[right].box)) continue
      conflicts.add(items[left].id)
      conflicts.add(items[right].id)
    }
  }
  return conflicts
}
