import { describe, expect, it, vi } from 'vitest'
import type * as THREE from 'three'
import type { ProductAppearance } from '../../domain/model'
import { ProductTextureEngine } from './ProductTextureEngine'

const appearance: ProductAppearance = {
  textureUrl: '/catalog/ikea/product.jpg',
  imageSourceUrl: 'https://www.ikea.com/image.jpg',
  sha256: 'a'.repeat(64),
  projection: 'front',
  removeWhiteBackground: true,
}

describe('ProductTextureEngine cache', () => {
  it('동일 이미지를 한 번만 로드하고 참조가 모두 해제될 때 dispose한다', async () => {
    const dispose = vi.fn()
    const texture = { dispose } as unknown as THREE.Texture
    const loader = vi.fn(async () => texture)
    const engine = new ProductTextureEngine(loader)

    const [first, second] = await Promise.all([
      engine.acquire(appearance),
      engine.acquire(appearance),
    ])
    expect(first).toBe(second)
    expect(loader).toHaveBeenCalledOnce()
    expect(engine.stats()).toEqual({
      entries: 1,
      loadedUrls: ['/catalog/ikea/product.jpg'],
    })

    engine.release(appearance)
    expect(dispose).not.toHaveBeenCalled()
    engine.release(appearance)
    expect(dispose).toHaveBeenCalledOnce()
    expect(engine.stats().entries).toBe(0)
  })
})
