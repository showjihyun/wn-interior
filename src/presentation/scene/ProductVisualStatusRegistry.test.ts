import { describe, expect, it, vi } from 'vitest'
import { ProductVisualStatusRegistry } from './ProductVisualStatusRegistry'

describe('상품 시각화 런타임 상태', () => {
  it('메시 로딩·성공·폴백 상태를 구독자에게 중복 없이 알린다', () => {
    const registry = new ProductVisualStatusRegistry()
    const listener = vi.fn()
    const unsubscribe = registry.subscribe(listener)

    registry.set('product-1', 'mesh-loading')
    registry.set('product-1', 'mesh-loading')
    registry.set('product-1', 'approved-mesh')

    expect(registry.get('product-1')).toBe('approved-mesh')
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    registry.set('product-1', 'decal-fallback')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
