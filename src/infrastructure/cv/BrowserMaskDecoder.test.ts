import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserMaskDecoder } from './BrowserMaskDecoder'

describe('BrowserMaskDecoder', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('RGBA mask의 밝은 픽셀을 이진 Gray로 변환한다', async () => {
    class FakeImage {
      src = ''
      naturalWidth = 2
      naturalHeight = 1
      decode = async () => undefined
    }
    vi.stubGlobal('Image', FakeImage)
    const context = {
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 255, 20, 0, 0, 255]) }),
    }
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement)

    const result = await new BrowserMaskDecoder().decode('data:image/png,x')

    expect([...result.data]).toEqual([255, 0])
    expect(result).toMatchObject({ width: 2, height: 1 })
  })
})
