import * as THREE from 'three'

export class SceneSurfaceRegistry {
  private renderer: THREE.WebGLRenderer | null = null
  private camera: THREE.Camera | null = null

  register(renderer: THREE.WebGLRenderer, camera: THREE.Camera): () => void {
    this.renderer = renderer
    this.camera = camera
    return () => {
      if (this.renderer === renderer) this.renderer = null
      if (this.camera === camera) this.camera = null
    }
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
