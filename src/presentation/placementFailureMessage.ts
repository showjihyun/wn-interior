import type { Product } from '../domain/model'
import type { DropResult } from '../domain/engine/drop'

const CAPABILITY_LABELS: Record<string, string> = {
  'kitchen.base-cabinet': '하부장',
  'kitchen.countertop': '상판',
  'kitchen.sink': '싱크',
  'kitchen.faucet': '수전',
}

export function placementFailureMessage(product: Product, result: DropResult): string {
  if (result.reason === 'out-of-room') return '방 안에만 배치할 수 있어요'
  if (result.reason === 'surface-required') {
    return `${product.name}을(를) 호환되는 받침 상판에 배치하세요`
  }
  if (result.reason === 'missing-dependency') {
    const labels = (result.missingCapabilities ?? []).map(
      (capability) => CAPABILITY_LABELS[capability] ?? capability
    )
    return `먼저 같은 설치 구성에 ${labels.join(', ')}을(를) 배치하세요`
  }
  return '공간이 부족해 배치할 수 없어요'
}
