import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { SceneSurfaceRegistry } from './SceneSurfaceRegistry'

describe('SceneSurfaceRegistry 카메라 제어', () => {
  it('OrbitControls 목표를 유지한 채 확대·축소하고 거리 범위를 지킨다', () => {
    const registry = new SceneSurfaceRegistry()
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 0, 10_000)
    const controls = {
      target: new THREE.Vector3(0, 0, 0),
      minDistance: 1_200,
      maxDistance: 45_000,
      update: vi.fn(),
    }
    registry.register({} as THREE.WebGLRenderer, camera, controls)

    expect((registry as any).zoomIn()).toBe(true)
    expect(camera.position.length()).toBe(8_000)
    expect((registry as any).zoomOut()).toBe(true)
    expect(camera.position.length()).toBe(10_000)
    camera.position.set(0, 0, 1_300)
    ;(registry as any).zoomIn()
    expect(camera.position.length()).toBe(1_200)
    camera.position.set(0, 0, 44_000)
    ;(registry as any).zoomOut()
    expect(camera.position.length()).toBe(45_000)
    expect(controls.update).toHaveBeenCalledTimes(4)
  })
})
