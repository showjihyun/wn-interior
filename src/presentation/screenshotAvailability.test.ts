import { describe, expect, it } from 'vitest'
import { screenshotAvailability } from './screenshotAvailability'

describe('screenshot button availability', () => {
  it('2D에서는 무반응 버튼을 노출하지 않고 비활성 이유를 안내한다', () => {
    expect(screenshotAvailability('2d')).toEqual({
      disabled: true,
      title: '3D 화면에서만 PNG 스크린샷을 저장할 수 있습니다',
    })
  })

  it('3D에서는 PNG 저장 버튼을 활성화한다', () => {
    expect(screenshotAvailability('3d')).toEqual({
      disabled: false,
      title: '현재 3D 화면을 PNG로 저장',
    })
  })
})
