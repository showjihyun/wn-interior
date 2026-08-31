import * as THREE from 'three'

export class SceneSurfaceRegistry {
  private renderer: THREE.WebGLRenderer | null = null
  private camera: THREE.Camera | null = null
  private controls: {
    target: THREE.Vector3
    minDistance: number
    maxDistance: number
    update(): void
  } | null = null

  register(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    controls?: {
      target: THREE.Vector3
      minDistance: number
      maxDistance: number
      update(): void
    } | null
  ): () => void {
    this.renderer = renderer
    this.camera = camera
    this.controls = controls ?? null
    return () => {
      if (this.renderer === renderer) this.renderer = null
      if (this.camera === camera) this.camera = null
      if (this.controls === controls) this.controls = null
    }
  }

  zoomIn(): boolean {
    return this.zoom(0.8)
  }

  zoomOut(): boolean {
    return this.zoom(1.25)
  }

  private zoom(scale: number): boolean {
    if (!this.camera || !this.controls) return false
    const offset = this.camera.position.clone().sub(this.controls.target)
    const distance = offset.length()
    if (!Number.isFinite(distance) || distance <= 0) return false
    const nextDistance = Math.max(
      this.controls.minDistance,
      Math.min(this.controls.maxDistance, distance * scale)
    )
    this.camera.position.copy(this.controls.target).addScaledVector(offset, nextDistance / distance)
    this.controls.update()
    return true
  }

  current(): { renderer: THREE.WebGLRenderer; camera: THREE.Camera } | null {
    return this.renderer && this.camera ? { renderer: this.renderer, camera: this.camera } : null
  }

  captureThumb(width = 280): string | undefined {
    const source = this.renderer?.domElement
    if (!source) return undefined
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.round((source.height / source.width) * width)
    canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  }

  downloadScreenshot(filename = 'homeplan3d.png'): void {
    const dataUrl = this.renderer?.domElement.toDataURL('image/png')
    if (!dataUrl) return
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = filename
    anchor.click()
  }
}
