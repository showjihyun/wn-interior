export const SAMPLE_RESET_CONFIRMATION = '정말 샘플 초기화를 진행하시겠습니까?'

export function requestSampleReset(
  confirm: (message: string) => boolean,
  reset: () => void
): boolean {
  if (!confirm(SAMPLE_RESET_CONFIRMATION)) return false
  reset()
  return true
}
