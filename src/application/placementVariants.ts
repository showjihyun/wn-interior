import type { Placement } from '../domain/model'

export interface PlacementVariant {
  id: string
  name: string
  thumb?: string
  placements: Placement[]
}

export interface SavePlacementVariantResult {
  saved: boolean
  duplicateName?: string
}

const clonePlacements = (placements: Placement[]): Placement[] =>
  placements.map((placement) => ({ ...placement, pos: { ...placement.pos } }))

const stableNumber = (value: number | undefined): number | null => {
  if (value === undefined || !Number.isFinite(value)) return null
  const rounded = Number(value.toFixed(6))
  return Object.is(rounded, -0) ? 0 : rounded
}

export function placementVariantFingerprint(placements: Placement[]): string {
  const entries = placements.map((placement) =>
    JSON.stringify({
      productId: placement.productId,
      pos: {
        x: stableNumber(placement.pos.x),
        y: stableNumber(placement.pos.y),
        z: stableNumber(placement.pos.z),
      },
      rotY: stableNumber(((placement.rotY % 360) + 360) % 360),
      colorway: placement.colorway ?? null,
      elevationOverride: stableNumber(placement.elevationOverride),
      dimsOverride: placement.dimsOverride
        ? {
            w: stableNumber(placement.dimsOverride.w),
            d: stableNumber(placement.dimsOverride.d),
            h: stableNumber(placement.dimsOverride.h),
          }
        : null,
    })
  )
  entries.sort()
  return JSON.stringify(entries)
}

export function findDuplicatePlacementVariant(
  variants: PlacementVariant[],
  placements: Placement[]
): PlacementVariant | null {
  const fingerprint = placementVariantFingerprint(placements)
  return (
    variants.find((variant) => placementVariantFingerprint(variant.placements) === fingerprint) ??
    null
  )
}

export function savePlacementVariant(input: {
  variants: PlacementVariant[]
  id: string
  name: string
  thumb?: string
  placements: Placement[]
}): PlacementVariant[] {
  return [
    ...input.variants,
    {
      id: input.id,
      name: input.name || `배치안 ${input.variants.length + 1}`,
      thumb: input.thumb,
      placements: clonePlacements(input.placements),
    },
  ]
}

export function removePlacementVariant(
  variants: PlacementVariant[],
  id: string
): PlacementVariant[] {
  return variants.filter((variant) => variant.id !== id)
}

export function placementsFromVariant(
  variants: PlacementVariant[],
  id: string
): Placement[] | null {
  const variant = variants.find((candidate) => candidate.id === id)
  return variant ? clonePlacements(variant.placements) : null
}
