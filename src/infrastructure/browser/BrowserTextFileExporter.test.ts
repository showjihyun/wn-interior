import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserTextFileExporter } from './BrowserTextFileExporter'

describe('BrowserTextFileExporter', () => {
  afterEach(() => vi.restoreAllMocks())

  it('다운로드 후 object URL을 반드시 해제한다', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({ click } as unknown as HTMLAnchorElement)

    new BrowserTextFileExporter().download('hello', 'test.txt', 'text/plain')

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
