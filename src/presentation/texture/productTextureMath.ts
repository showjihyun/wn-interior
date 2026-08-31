export function removeWhiteBackground(
  source: Uint8ClampedArray,
  threshold = 245,
  width?: number,
  height?: number
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source)
  const softStart = Math.max(0, threshold - 55)
  const fadePixel = (index: number) => {
    const red = output[index]
    const green = output[index + 1]
    const blue = output[index + 2]
    const minimum = Math.min(red, green, blue)
    const maximum = Math.max(red, green, blue)
    const chroma = maximum - minimum
    if (minimum >= threshold && chroma <= 12) {
      output[index + 3] = 0
      return
    }
    if (minimum > softStart && chroma <= 18) {
      const factor = (threshold - minimum) / Math.max(1, threshold - softStart)
      output[index + 3] = Math.round(output[index + 3] * Math.max(0, Math.min(1, factor)))
    }
  }
  if (!width || !height || width * height * 4 !== output.length) {
    for (let index = 0; index < output.length; index += 4) fadePixel(index)
    return output
  }

  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  const enqueue = (pixel: number) => {
    if (visited[pixel]) return
    const index = pixel * 4
    const minimum = Math.min(output[index], output[index + 1], output[index + 2])
    const maximum = Math.max(output[index], output[index + 1], output[index + 2])
    if (minimum <= softStart || maximum - minimum > 24) return
    visited[pixel] = 1
    queue[tail++] = pixel
  }
  for (let x = 0; x < width; x++) {
    enqueue(x)
    enqueue((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width)
    enqueue(y * width + width - 1)
  }
  while (head < tail) {
    const pixel = queue[head++]
    const x = pixel % width
    const y = Math.floor(pixel / width)
    fadePixel(pixel * 4)
    if (x > 0) enqueue(pixel - 1)
    if (x + 1 < width) enqueue(pixel + 1)
    if (y > 0) enqueue(pixel - width)
    if (y + 1 < height) enqueue(pixel + width)
  }
  return output
}

export interface PixelBounds {
  x: number
  y: number
  width: number
  height: number
}

export function fitImageWithinBounds(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (
    ![sourceWidth, sourceHeight, maxWidth, maxHeight].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    return { width: Math.max(0, maxWidth), height: Math.max(0, maxHeight) }
  }
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight)
  return { width: sourceWidth * scale, height: sourceHeight * scale }
}

export function findOpaqueBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  minimumAlpha = 32
): PixelBounds | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] <= minimumAlpha) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return maxX < minX || maxY < minY
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}
