import type { Placement, Product } from './model'
import { resolveDims } from './engine/dims'

export interface SurfacePlacement {
  x: number
  z: number
  rotY: number
  elevation: number
  supportPlacementId: string
}

export function requiresSurfaceHost(product: Product): boolean {
  return product.mount === 'surface'
}

export function resolveSurfacePlacement(
  product: Product,
  placements: Placement[],
  x: number,
  z: number,
  productOf: (id: string) => Product | undefined
): SurfacePlacement | null {
  if (!requiresSurfaceHost(product)) return null
  const supportedBy = product.installation?.surface?.supportedBy ?? []
  if (!supportedBy.length) return null

  const hosts = placements
    .map((placement) => {
      const host = productOf(placement.productId)
      if (
        !host ||
        !host.installation?.provides.some((capability) => supportedBy.includes(capability))
      )
        return null
      const dims = resolveDims(host, placement)
      const radians = (placement.rotY * Math.PI) / 180
      const cos = Math.cos(radians)
      const sin = Math.sin(radians)
      const dx = x - placement.pos.x
      const dz = z - placement.pos.z
      const localX = dx * cos + dz * sin
      const localZ = -dx * sin + dz * cos
      if (Math.abs(localX) > dims.w / 2 || Math.abs(localZ) > dims.d / 2) return null
      return { placement, host, dims, localX, area: dims.w * dims.d, cos, sin }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => left.area - right.area)

  const target = hosts[0]
  if (!target) return null
  const { placement, host, dims, cos, sin } = target
  const maxLocalX = Math.max(0, dims.w / 2 - product.dims.w / 2 - 20)
  const localX = Math.max(-maxLocalX, Math.min(maxLocalX, target.localX))
  const localZ =
    product.installation?.surface?.anchor === 'center'
      ? 0
      : -dims.d / 2 + Math.min(dims.d / 2, product.dims.d / 2 + 20)
  const hostBase =
    host.mount === 'wall-mount' || host.mount === 'surface'
      ? (placement.elevationOverride ?? host.defaultElevation ?? placement.pos.y)
      : placement.pos.y

  return {
    x: placement.pos.x + localX * cos - localZ * sin,
    z: placement.pos.z + localX * sin + localZ * cos,
    rotY: placement.rotY,
    elevation: hostBase + dims.h,
    supportPlacementId: placement.id,
  }
}
