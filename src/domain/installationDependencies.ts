import type { Placement, Product } from './model'

export interface InstallationDependencyResult {
  ok: boolean
  missingCapabilities: string[]
}

function rootSupportId(
  placement: Placement,
  placements: Placement[],
  seen = new Set<string>()
): string {
  if (!placement.supportPlacementId || seen.has(placement.id)) return placement.id
  seen.add(placement.id)
  const parent = placements.find((candidate) => candidate.id === placement.supportPlacementId)
  return parent ? rootSupportId(parent, placements, seen) : placement.id
}

export function validateInstallationDependencies(
  product: Product,
  placements: Placement[],
  supportPlacementId: string | undefined,
  productOf: (id: string) => Product | undefined
): InstallationDependencyResult {
  const requires = product.installation?.requires
  if (!requires) return { ok: true, missingCapabilities: [] }

  let candidates = placements
  if (requires.scope === 'support-chain') {
    const support = placements.find((placement) => placement.id === supportPlacementId)
    if (!support) {
      return {
        ok: false,
        missingCapabilities: [...(requires.allOf ?? []), ...(requires.anyOf ?? [])],
      }
    }
    const rootId = rootSupportId(support, placements)
    candidates = placements.filter((placement) => rootSupportId(placement, placements) === rootId)
  }

  const capabilities = new Set(
    candidates.flatMap((placement) => productOf(placement.productId)?.installation?.provides ?? [])
  )
  const missingAll = (requires.allOf ?? []).filter((capability) => !capabilities.has(capability))
  const anyOf = requires.anyOf ?? []
  const missingAny =
    anyOf.length && !anyOf.some((capability) => capabilities.has(capability)) ? anyOf : []
  const missingCapabilities = [...missingAll, ...missingAny]
  return { ok: missingCapabilities.length === 0, missingCapabilities }
}

export function findBrokenInstallationDependents(
  removingPlacementId: string,
  placements: Placement[],
  productOf: (id: string) => Product | undefined
): Placement[] {
  const remaining = placements.filter((placement) => placement.id !== removingPlacementId)
  return remaining.filter((placement) => {
    const product = productOf(placement.productId)
    if (!product) return false
    if (placement.supportPlacementId === removingPlacementId) return true
    return !validateInstallationDependencies(
      product,
      remaining,
      placement.supportPlacementId,
      productOf
    ).ok
  })
}
