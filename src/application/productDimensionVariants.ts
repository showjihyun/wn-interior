import type { Placement, Product, ProductDimensionVariant } from '../domain/model'

export function findActiveDimensionVariant(
  product: Product,
  dims: Product['dims']
): ProductDimensionVariant | undefined {
  return product.dimensionVariants?.find(
    (variant) => variant.dims.w === dims.w && variant.dims.d === dims.d && variant.dims.h === dims.h
  )
}

export function placementPatchForDimensionVariant(
  product: Product,
  variantId: string
): Pick<Placement, 'dimsOverride'> | null {
  const variant = product.dimensionVariants?.find((candidate) => candidate.id === variantId)
  if (!variant) return null
  const isProductDefault =
    variant.dims.w === product.dims.w &&
    variant.dims.d === product.dims.d &&
    variant.dims.h === product.dims.h
  return { dimsOverride: isProductDefault ? undefined : { ...variant.dims } }
}
