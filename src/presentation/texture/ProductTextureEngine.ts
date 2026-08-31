import * as THREE from 'three'
import type { ProductAppearance } from '../../domain/model'
import { findOpaqueBounds, removeWhiteBackground } from './productTextureMath'

export type ProductTextureLoader = (appearance: ProductAppearance) => Promise<THREE.Texture>

interface TextureEntry {
  refs: number
  promise: Promise<THREE.Texture>
  texture?: THREE.Texture
}

const cacheKey = (appearance: ProductAppearance) =>
  `${appearance.textureUrl}|${appearance.removeWhiteBackground ? 1 : 0}|${appearance.alphaThreshold ?? 245}`

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`product-texture-load-failed:${url}`))
    image.src = url
  })
}

export async function loadProductTexture(appearance: ProductAppearance): Promise<THREE.Texture> {
  const image = await loadImage(appearance.textureUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('product-texture-canvas-unavailable')
  context.drawImage(image, 0, 0)
  let textureCanvas = canvas
  if (appearance.removeWhiteBackground !== false) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    pixels.data.set(
      removeWhiteBackground(pixels.data, appearance.alphaThreshold, canvas.width, canvas.height)
    )
    context.putImageData(pixels, 0, 0)
    const bounds = findOpaqueBounds(pixels.data, canvas.width, canvas.height)
    if (bounds) {
      const padding = Math.max(4, Math.round(Math.max(bounds.width, bounds.height) * 0.025))
      const x = Math.max(0, bounds.x - padding)
      const y = Math.max(0, bounds.y - padding)
      const width = Math.min(canvas.width - x, bounds.width + padding * 2)
      const height = Math.min(canvas.height - y, bounds.height + padding * 2)
      const cropped = document.createElement('canvas')
      cropped.width = width
      cropped.height = height
      cropped.getContext('2d')?.drawImage(canvas, x, y, width, height, 0, 0, width, height)
      textureCanvas = cropped
    }
  }
  const texture = new THREE.CanvasTexture(textureCanvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  texture.userData.sourceUrl = appearance.imageSourceUrl
  texture.userData.sha256 = appearance.sha256
  return texture
}

export class ProductTextureEngine {
  private readonly cache = new Map<string, TextureEntry>()

  constructor(private readonly loader: ProductTextureLoader = loadProductTexture) {}

  acquire(appearance: ProductAppearance): Promise<THREE.Texture> {
    const key = cacheKey(appearance)
    const existing = this.cache.get(key)
    if (existing) {
      existing.refs += 1
      return existing.promise
    }

    const entry: TextureEntry = {
      refs: 1,
      promise: Promise.resolve(null as unknown as THREE.Texture),
    }
    entry.promise = this.loader(appearance)
      .then((texture) => {
        entry.texture = texture
        return texture
      })
      .catch((error) => {
        if (this.cache.get(key) === entry) this.cache.delete(key)
        throw error
      })
    this.cache.set(key, entry)
    return entry.promise
  }

  release(appearance: ProductAppearance): void {
    const key = cacheKey(appearance)
    const entry = this.cache.get(key)
    if (!entry) return
    entry.refs = Math.max(0, entry.refs - 1)
    if (entry.refs > 0) return
    this.cache.delete(key)
    if (entry.texture) entry.texture.dispose()
    else entry.promise.then((texture) => texture.dispose()).catch(() => undefined)
  }

  disposeAll(): void {
    for (const entry of this.cache.values()) {
      if (entry.texture) entry.texture.dispose()
      else entry.promise.then((texture) => texture.dispose()).catch(() => undefined)
    }
    this.cache.clear()
  }

  stats(): { entries: number; loadedUrls: string[] } {
    return {
      entries: this.cache.size,
      loadedUrls: [...this.cache.keys()].map((key) => key.split('|')[0]),
    }
  }
}
