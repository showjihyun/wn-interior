// 반전 이미지(어두운 배경 도면) 대응
import type { Gray } from './planVision'

export function invertGray(gray: Gray): Gray {
  const out = new Uint8Array(gray.data.length)
  for (let i = 0; i < out.length; i++) out[i] = gray.data[i] ? 0 : 255
  return { data: out, width: gray.width, height: gray.height }
}

export function inkRatio(gray: Gray): number {
  let n = 0
  for (let i = 0; i < gray.data.length; i++) if (gray.data[i]) n++
  return n / gray.data.length
}
