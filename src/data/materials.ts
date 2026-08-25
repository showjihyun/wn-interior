// ─────────────────────────────────────────────────────────────
// 마감재(바닥재/벽지) 정의 — 실제 국내 유통 규격 기반
// 절차적 텍스처로 렌더링 (textures.ts 참조)
// ─────────────────────────────────────────────────────────────

export type MaterialKind = 'floor' | 'wall'

export interface FinishMaterial {
  id: string
  kind: MaterialKind
  name: string
  /** 절차 텍스처 생성기 종류 */
  tex: 'vinyl600' | 'wood' | 'woodDark' | 'tile' | 'tileSmall' | 'concrete' | 'wallpaperPlain' | 'wallpaperGray' | 'fabricWall' | 'woodSlat' | 'accent'
  /** 텍스처 1타일의 실물 크기(mm) — 실규격 반복용 */
  tileMm: number
  baseColor: string
}

export const FLOOR_MATERIALS: FinishMaterial[] = [
  { id: 'f-vinyl-oak', kind: 'floor', name: '장판 오크 (600×600)', tex: 'vinyl600', tileMm: 600, baseColor: '#c8a878' },
  { id: 'f-wood-natural', kind: 'floor', name: '마루 내추럴 오크', tex: 'wood', tileMm: 1200, baseColor: '#b98d5e' },
  { id: 'f-wood-dark', kind: 'floor', name: '마루 스모크 우드', tex: 'woodDark', tileMm: 1200, baseColor: '#7a5c40' },
  { id: 'f-tile-gray', kind: 'floor', name: '세라믹 타일 그레이 (600×600)', tex: 'tile', tileMm: 600, baseColor: '#9a9a98' },
  { id: 'f-tile-small', kind: 'floor', name: '모자이크 타일 화이트 (300×300)', tex: 'tileSmall', tileMm: 300, baseColor: '#cfcfcc' },
  { id: 'f-concrete', kind: 'floor', name: '시멘트 무채색', tex: 'concrete', tileMm: 1000, baseColor: '#a8a8a4' },
]

export const WALL_MATERIALS: FinishMaterial[] = [
  { id: 'w-silk-white', kind: 'wall', name: '실크 벽지 화이트', tex: 'wallpaperPlain', tileMm: 1000, baseColor: '#f2efe9' },
  { id: 'w-silk-gray', kind: 'wall', name: '실크 벽지 웜그레이', tex: 'wallpaperGray', tileMm: 1000, baseColor: '#d8d3ca' },
  { id: 'w-fabric-beige', kind: 'wall', name: '패브릭 벽지 베이지', tex: 'fabricWall', tileMm: 500, baseColor: '#e2d6c3' },
  { id: 'w-woodslat', kind: 'wall', name: '우드 슬랫 패널', tex: 'woodSlat', tileMm: 400, baseColor: '#a07a52' },
  { id: 'w-accent-green', kind: 'wall', name: '포인트 컬러 딥그린 도장', tex: 'accent', tileMm: 1000, baseColor: '#5c6f63' },
  { id: 'w-accent-navy', kind: 'wall', name: '포인트 컬러 네이비 도장', tex: 'accent', tileMm: 1000, baseColor: '#4a5568' },
]

export function getMaterial(id?: string): FinishMaterial | undefined {
  return [...FLOOR_MATERIALS, ...WALL_MATERIALS].find((m) => m.id === id)
}
