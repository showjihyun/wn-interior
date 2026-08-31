import { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '../../domain/model'

const textureRuntime = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
}))

vi.mock('../AppRuntimeContext', () => ({
  useAppRuntime: () => ({ productTextureEngine: textureRuntime }),
}))

import { ProductImageDecal } from './ProductImageDecal'

const product: Product = {
  id: 'photo-product',
  name: '사진 상품',
  category: 'living',
  dims: { w: 1000, d: 500, h: 700 },
  mount: 'floor',
  shape: 'box',
  appearance: {
    textureUrl: '/catalog/photo.jpg',
    imageSourceUrl: 'https://example.com/photo',
    sha256: 'a'.repeat(64),
    projection: 'front',
  },
}

describe('상품 이미지 데칼 특성화', () => {
  beforeEach(() => {
    textureRuntime.acquire.mockReset()
    textureRuntime.release.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('appearance가 없으면 texture 자원을 요청하지 않는다', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<ProductImageDecal product={{ ...product, appearance: undefined }} />))

    expect(host.childElementCount).toBe(0)
    expect(textureRuntime.acquire).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('texture가 준비되면 투영면을 렌더하고 unmount 시 ref-count를 해제한다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const texture = new THREE.Texture()
    textureRuntime.acquire.mockResolvedValue(texture)
    const host = document.createElement('div')
    const root = createRoot(host)

    await act(async () => {
      root.render(<ProductImageDecal product={product} />)
      await Promise.resolve()
    })

    expect(textureRuntime.acquire).toHaveBeenCalledWith(product.appearance)
    expect(host.querySelector('mesh')).not.toBeNull()
    act(() => root.unmount())
    expect(textureRuntime.release).toHaveBeenCalledWith(product.appearance)
    error.mockRestore()
  })

  it('texture 로드 실패를 상위 시각화 상태에 알린다', async () => {
    const onError = vi.fn()
    textureRuntime.acquire.mockRejectedValue(new Error('fixture-texture-failed'))
    const host = document.createElement('div')
    const root = createRoot(host)

    await act(async () => {
      root.render(<ProductImageDecal product={product} onError={onError} />)
      await Promise.resolve()
    })

    expect(onError).toHaveBeenCalledOnce()
    expect(host.childElementCount).toBe(0)
    act(() => root.unmount())
  })
})
