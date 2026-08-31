import { describe, expect, it, vi } from 'vitest'
import { requestSampleReset, SAMPLE_RESET_CONFIRMATION } from './sampleResetConfirmation'

describe('sample reset confirmation', () => {
  it('취소하면 초기화하지 않는다', () => {
    const confirm = vi.fn(() => false)
    const reset = vi.fn()

    expect(requestSampleReset(confirm, reset)).toBe(false)
    expect(confirm).toHaveBeenCalledWith(SAMPLE_RESET_CONFIRMATION)
    expect(reset).not.toHaveBeenCalled()
  })

  it('확인한 경우에만 초기화를 실행한다', () => {
    const confirm = vi.fn(() => true)
    const reset = vi.fn()

    expect(requestSampleReset(confirm, reset)).toBe(true)
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
