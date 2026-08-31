import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

const gltfRuntime = vi.hoisted(() => ({ scene: null as THREE.Object3D | null }))

vi.mock('@react-three/drei', () => ({
  useGLTF: () => ({ scene: gltfRuntime.scene }),
}))

import { FittedGltfProduct, MeshLoadErrorBoundary } from './ProductVisual'

function BrokenVisual(): ReactNode {
  throw new Error('broken-generated-mesh')
}

describe('승인 메시 렌더 오류 경계', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('GLB 파싱·로드 오류가 나도 기존 시각화 폴백을 유지한다', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const preventUnhandled = (event: ErrorEvent) => event.preventDefault()
    window.addEventListener('error', preventUnhandled)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <MeshLoadErrorBoundary resetKey="mesh-v1" fallback={<span>공식 사진 폴백</span>}>
          <BrokenVisual />
        </MeshLoadErrorBoundary>
      )
    })

    expect(host.textContent).toBe('공식 사진 폴백')
    act(() => root.unmount())
    window.removeEventListener('error', preventUnhandled)
    error.mockRestore()
  })

  it('승인 GLB를 공식 envelope 안에 맞추고 시각화 전용 provenance를 남긴다', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const source = new THREE.Group()
    source.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2)))
    const clone = source.clone(true)
    vi.spyOn(source, 'clone').mockReturnValue(clone)
    gltfRuntime.scene = source
    const host = document.createElement('div')
    const root = createRoot(host)

    act(() => {
      root.render(
        <FittedGltfProduct
          url="/catalog/generated/approved.glb"
          dims={{ w: 1000, d: 600, h: 500 }}
          decision={{
            kind: 'approved-mesh',
            asset: {
              assetId: 'approved-box',
              productId: 'box',
              productFingerprint: 'product-mesh-v1|box|1000|600|500|floor|no-image|no-source',
              uri: '/catalog/generated/approved.glb',
              sha256: 'a'.repeat(64),
              byteLength: 1000,
              visualOnly: true,
              publishedAt: '2026-08-28T00:00:00.000Z',
              generatorLabel: 'test generator',
            },
          }}
        />
      )
    })

    expect(clone.scale.toArray()).toEqual([250, 250, 300])
    expect(clone.position.toArray()).toEqual([0, 250, 0])
    expect(clone.userData).toEqual(
      expect.objectContaining({
        visualSource: 'approved-mesh',
        visualOnly: true,
        assetId: 'approved-box',
        sha256: 'a'.repeat(64),
        axisStretchRatio: 1.2,
      })
    )
    act(() => root.unmount())
    error.mockRestore()
  })
})
