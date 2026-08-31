// ─────────────────────────────────────────────────────────────
// 홈플랜 3D — 핵심 도메인 모델 (모든 길이 단위: mm)
// 좌표계: 2D 평면은 x(동)+, y(남)+ / 3D에서는 x, z=y, y축=높이
// ─────────────────────────────────────────────────────────────

export interface Pt {
  x: number
  y: number
}

/** 벽: 중심선(a→b)으로 정의 */
export interface Wall {
  id: string
  a: Pt
  b: Pt
  thickness: number // 외벽 200 / 내벽 120 권장
}

export type OpeningType = 'door' | 'window' | 'entry'

/** 벽 위 개구부(문/창문). offset = 벽 시작점(a)부터의 거리(mm) */
export interface Opening {
  id: string
  wallId: string
  type: OpeningType
  offset: number
  width: number
  height: number // 문: 2000~2100, 창: 1200~1500
  sill: number // 바닥에서 하단까지 높이 (창 900, 문 0)
}

/** 방: 폴리곤(시계방향/반시계 무관) + 마감재 */
export interface Room {
  id: string
  name: string
  polygon: Pt[]
  floorMaterialId?: string
  wallMaterialId?: string
}

export interface FloorPlan {
  unit: 'mm'
  wallHeight: number
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
}

export interface FloorPlanReview {
  sourceImageDataUrl: string
  sourceWidth: number
  sourceHeight: number
  mmPerPx: number
  scaleMode: 'calibrated' | 'estimated'
  requiredFor3d: boolean
  status: 'pending' | 'completed'
  baselinePlanFingerprint?: string
  baselineTargetFingerprints?: Record<string, string>
  evidence?: FloorPlanReviewEvidence
  completedAt?: string
}

export type FloorPlanReviewTargetKind = 'wall' | 'room' | 'opening' | 'scale'
export type FloorPlanReviewDecision = 'modified' | 'no-change'

export interface FloorPlanReviewEvidence {
  targetKind: FloorPlanReviewTargetKind
  targetId?: string
  targetLabel: string
  decision: FloorPlanReviewDecision
  note: string
  planFingerprint: string
  recordedAt: string
}

export interface FloorPlanReviewEvidenceInput {
  targetKind: FloorPlanReviewTargetKind
  targetId?: string
  decision: FloorPlanReviewDecision
  note: string
}

export type Mount = 'floor' | 'wall-mount' | 'ceiling' | 'wall' | 'surface'

export interface RetailProductInfo {
  retailer: string
  articleNumber: string
  productUrl: string
  currency: 'KRW'
  amount: number
  checkedAt: string
  priceBasis: string
  included: string[]
  excluded: string[]
  description?: string
}

export interface ProductAppearance {
  textureUrl: string
  imageSourceUrl: string
  sha256: string
  projection: 'front' | 'top' | 'curtain' | 'cutout'
  removeWhiteBackground?: boolean
  alphaThreshold?: number
}

export interface ProductDimensionVariant {
  id: string
  label: string
  dims: { w: number; d: number; h: number }
}

/** 카탈로그 제품 — 전부 실측(mm) 기준 */
export interface Product {
  id: string
  name: string
  brand?: string
  category: CategoryId
  /** 실측 치수: w=폭(x), d=깊이(z), h=높이(y) */
  dims: { w: number; d: number; h: number }
  mount: Mount
  /** 벽 부착형(싱크대·붙박이장 등): 배치 시 가장 가까운 벽에 자석 */
  snapToWall?: boolean
  /** wall-mount 제품의 기본 설치 높이(바닥부터) */
  defaultElevation?: number
  colorways?: string[]
  shape: ShapeKind
  /** GLTF 모델 URL (있으면 파라메트릭 셰이프 대신 로드, 실측 높이로 자동 피팅) */
  modelUrl?: string
  /** 브랜드 DB 제품 정보 (출처 추적) */
  model?: string
  sourceUrl?: string
  sourcedAt?: string
  /** 참고 가격 (원) — 출처 시점 기준, 옵션별 변동 가능 */
  price?: number
  priceNote?: string
  note?: string
  retail?: RetailProductInfo
  appearance?: ProductAppearance
  /** 접이식·확장형 제품의 이름 있는 공식 사용 상태. */
  dimensionVariants?: ProductDimensionVariant[]
}

export type CategoryId =
  'kitchen' | 'living' | 'bedroom' | 'storage' | 'appliance' | 'lighting' | 'bath' | 'custom'

export type ShapeKind =
  | 'box'
  | 'sofa3'
  | 'kivikSofa'
  | 'armchair'
  | 'coffeeTable'
  | 'shelfCoffeeTable'
  | 'diningTable'
  | 'gatelegTable'
  | 'chair'
  | 'bed'
  | 'highBedFrame'
  | 'wardrobe'
  | 'modularWardrobe'
  | 'openBookcase'
  | 'dresser'
  | 'sideTable'
  | 'tvStand'
  | 'tvWall'
  | 'sinkLower'
  | 'sinkUpper'
  | 'fridge'
  | 'rug'
  | 'shoeCabinet'
  | 'desk'
  | 'shelfWall'
  | 'washer'
  | 'ac'
  | 'pendant'
  | 'floorLamp'
  | 'tableGlobeLamp'
  | 'toilet'
  | 'washbasin'
  | 'mirror'
  | 'microwave'
  | 'islandBar'
  | 'robotVacuum'
  | 'airPurifier'
  | 'tvOled'
  | 'curtain'
  | 'blind'
  | 'inductionHob'
  | 'faucet'
  | 'kitchenSink'

/** 공간에 배치된 제품 인스턴스 */
export interface Placement {
  id: string
  productId: string
  roomId?: string
  /** 위치: x,z = 평면 좌표(mm), y = 바닥으로부터 높이(mm) */
  pos: { x: number; y: number; z: number }
  rotY: number // deg
  colorway?: string
  elevationOverride?: number
  /** 상판 부착형 제품이 올라간 배치 인스턴스 */
  supportPlacementId?: string
  /** 치수 오버라이드 — 유사 제품을 실측에 맞게 조정 (누락/무효 값은 제품 실측 폴백) */
  dimsOverride?: { w: number; d: number; h: number }
}

export interface Project {
  version: 1
  /** 저장소 내 고유 id (다중 프로젝트 지원) */
  id?: string
  name: string
  origin?: 'sample' | 'blank' | 'import' | 'ai' | 'cv'
  plan: FloorPlan
  placements: Placement[]
  customProducts: Product[]
  floorPlanReview?: FloorPlanReview
  createdAt: string
  updatedAt: string
}
