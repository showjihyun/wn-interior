import type { Mount, Placement, Product } from './model'
import { resolveDims } from './engine/dims'

export interface AuthoritativePlacementGeometry {
  dims: Product['dims']
  mount: Mount
  elevation: number
  blocksFloor: boolean
}

export function resolveAuthoritativePlacementGeometry(
  product: Product,
  placement?: Placement
): AuthoritativePlacementGeometry {
  const dims = resolveDims(product, placement)
  const elevation =
    product.mount === 'wall-mount'
      ? (placement?.elevationOverride ?? product.defaultElevation ?? 0)
      : 0
  return {
    dims,
    mount: product.mount,
    elevation,
    blocksFloor: product.mount === 'floor' && dims.h > 50,
  }
}
