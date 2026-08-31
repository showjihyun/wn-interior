export type ProductVisualRenderStatus =
  | 'mesh-loading'
  | 'approved-mesh'
  | 'local-review-loading'
  | 'local-review-mesh'
  | 'user-model-loading'
  | 'user-model'
  | 'decal-fallback'
  | 'parametric-fallback'

export class ProductVisualStatusRegistry {
  private readonly statuses = new Map<string, ProductVisualRenderStatus>()
  private readonly listeners = new Set<() => void>()

  get(productId: string): ProductVisualRenderStatus | undefined {
    return this.statuses.get(productId)
  }

  set(productId: string, status: ProductVisualRenderStatus): void {
    if (this.statuses.get(productId) === status) return
    this.statuses.set(productId, status)
    for (const listener of this.listeners) listener()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
