import type { Gray } from '../../domain/engine/planVision'

export interface MaskDecoder {
  decode(dataUrl: string): Promise<Gray>
}

export class BrowserMaskDecoder implements MaskDecoder {
  async decode(dataUrl: string): Promise<Gray> {
    const image = new Image()
    image.src = dataUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas-context-unavailable')
    context.drawImage(image, 0, 0)
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
    const data = new Uint8Array(canvas.width * canvas.height)
    for (let index = 0, pixel = 0; index < data.length; index++, pixel += 4) {
      if (rgba[pixel] >= 128) data[index] = 255
    }
    return { data, width: canvas.width, height: canvas.height }
  }
}
