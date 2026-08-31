// 배치 단위 치수 오버라이드 - 유사 제품을 배치 후 실측에 맞게 조정
import type { Placement, Product } from '../model'

const positive = (v: unknown): v is number => typeof v === 'number' && v > 0

/** 제품 실측을 기본으로, 배치의 dimsOverride(유효한 값만)를 덮어쓴 유효 치수 반환 */
export function resolveDims(product: Product, placement?: Placement): Product['dims'] {
  const base = product.dims
  const ov = placement?.dimsOverride
  if (!ov) return base
  return {
    w: positive(ov.w) ? ov.w : base.w,
    d: positive(ov.d) ? ov.d : base.d,
    h: positive(ov.h) ? ov.h : base.h,
  }
}
