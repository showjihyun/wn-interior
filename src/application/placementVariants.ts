import type { Placement } from '../domain/model'

export interface PlacementVariant {
  id: string
  name: string
  thumb?: string
  placements: Placement[]
}

const clonePlacements = (placements: Placement[]): Placement[] =>
  placements.map((placement) => ({ ...placement, pos: { ...placement.pos } }))

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
