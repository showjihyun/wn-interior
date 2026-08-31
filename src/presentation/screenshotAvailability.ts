export interface ScreenshotAvailability {
  disabled: boolean
  title: string
}

export function screenshotAvailability(mode: '2d' | '3d'): ScreenshotAvailability {
  return mode === '2d'
    ? {
        disabled: true,
        title: '3D 화면에서만 PNG 스크린샷을 저장할 수 있습니다',
      }
    : {
        disabled: false,
        title: '현재 3D 화면을 PNG로 저장',
      }
}
