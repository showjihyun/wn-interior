import type { FloorPlan } from '../../../domain/model'

// 국민평형(34평형대) 샘플 평면도 — 단위 mm
// 배치: 좌상 안방 / 우상 욕실 / 좌하 방2 / 중하 현관 / 우측 거실·주방(L자)
const W_EXT = 200
const W_INT = 120

export const SAMPLE_PLAN: FloorPlan = {
  unit: 'mm',
  wallHeight: 2400,
  walls: [
    { id: 'w-n', a: { x: 0, y: 0 }, b: { x: 10600, y: 0 }, thickness: W_EXT },
    { id: 'w-e', a: { x: 10600, y: 0 }, b: { x: 10600, y: 7400 }, thickness: W_EXT },
    { id: 'w-s', a: { x: 10600, y: 7400 }, b: { x: 0, y: 7400 }, thickness: W_EXT },
    { id: 'w-w', a: { x: 0, y: 7400 }, b: { x: 0, y: 0 }, thickness: W_EXT },
    // 내벽
    { id: 'i-master-e', a: { x: 4600, y: 0 }, b: { x: 4600, y: 4600 }, thickness: W_INT },
    { id: 'i-master-s', a: { x: 0, y: 4600 }, b: { x: 4600, y: 4600 }, thickness: W_INT },
    { id: 'i-bed2-w', a: { x: 2800, y: 4600 }, b: { x: 2800, y: 7400 }, thickness: W_INT },
    { id: 'i-bath-s', a: { x: 4600, y: 2400 }, b: { x: 7200, y: 2400 }, thickness: W_INT },
    { id: 'i-bath-e', a: { x: 7200, y: 0 }, b: { x: 7200, y: 2400 }, thickness: W_INT },
    { id: 'i-hall-e', a: { x: 4600, y: 4600 }, b: { x: 4600, y: 7400 }, thickness: W_INT },
  ],
  openings: [
    // 현관 출입문 (남벽)
    {
      id: 'o-entry',
      wallId: 'w-s',
      type: 'entry',
      offset: 5900,
      width: 1100,
      height: 2100,
      sill: 0,
    },
    // 안방 문 (안방 남벽)
    {
      id: 'o-m1',
      wallId: 'i-master-s',
      type: 'door',
      offset: 3500,
      width: 850,
      height: 2050,
      sill: 0,
    },
    // 방2 문 (방2 동벽)
    {
      id: 'o-m2',
      wallId: 'i-bed2-w',
      type: 'door',
      offset: 900,
      width: 800,
      height: 2050,
      sill: 0,
    },
    // 욕실 문 (욕실 남벽)
    {
      id: 'o-bath',
      wallId: 'i-bath-s',
      type: 'door',
      offset: 700,
      width: 750,
      height: 2000,
      sill: 0,
    },
    // 창문들
    {
      id: 'o-win-master',
      wallId: 'w-n',
      type: 'window',
      offset: 1300,
      width: 2000,
      height: 1500,
      sill: 900,
    },
    {
      id: 'o-win-bed2',
      wallId: 'w-w',
      type: 'window',
      offset: 1400,
      width: 1600,
      height: 1400,
      sill: 950,
    },
    {
      id: 'o-win-living-s',
      wallId: 'w-s',
      type: 'window',
      offset: 1800,
      width: 4200,
      height: 1600,
      sill: 500,
    },
    {
      id: 'o-win-living-e',
      wallId: 'w-e',
      type: 'window',
      offset: 2600,
      width: 2200,
      height: 1500,
      sill: 800,
    },
    {
      id: 'o-win-bath',
      wallId: 'i-bath-e',
      type: 'window',
      offset: 800,
      width: 700,
      height: 600,
      sill: 1500,
    },
  ],
  rooms: [
    {
      id: 'r-master',
      name: '안방',
      polygon: [
        { x: 0, y: 0 },
        { x: 4600, y: 0 },
        { x: 4600, y: 4600 },
        { x: 0, y: 4600 },
      ],
      floorMaterialId: 'f-wood-natural',
      wallMaterialId: 'w-silk-white',
    },
    {
      id: 'r-bath',
      name: '욕실',
      polygon: [
        { x: 4600, y: 0 },
        { x: 7200, y: 0 },
        { x: 7200, y: 2400 },
        { x: 4600, y: 2400 },
      ],
      floorMaterialId: 'f-tile-small',
      wallMaterialId: 'w-silk-white',
    },
    {
      id: 'r-bed2',
      name: '방2',
      polygon: [
        { x: 0, y: 4600 },
        { x: 2800, y: 4600 },
        { x: 2800, y: 7400 },
        { x: 0, y: 7400 },
      ],
      floorMaterialId: 'f-vinyl-oak',
      wallMaterialId: 'w-silk-gray',
    },
    {
      id: 'r-hall',
      name: '현관',
      polygon: [
        { x: 2800, y: 4600 },
        { x: 4600, y: 4600 },
        { x: 4600, y: 7400 },
        { x: 2800, y: 7400 },
      ],
      floorMaterialId: 'f-tile-gray',
      wallMaterialId: 'w-silk-white',
    },
    {
      id: 'r-living',
      name: '거실·주방',
      polygon: [
        { x: 7200, y: 0 },
        { x: 10600, y: 0 },
        { x: 10600, y: 7400 },
        { x: 4600, y: 7400 },
        { x: 4600, y: 2400 },
        { x: 7200, y: 2400 },
      ],
      floorMaterialId: 'f-vinyl-oak',
      wallMaterialId: 'w-silk-white',
    },
  ],
}

/** 샘플 프로젝트의 기본 가구 배치 (전부 실측 카탈로그 제품) */
export const SAMPLE_PLACEMENTS = [
  // ── 안방 ──
  { productId: 'p-bed-queen', pos: { x: 2300, y: 0, z: 1750 }, rotY: -90 },
  { productId: 'p-side-table', pos: { x: 1050, y: 0, z: 700 }, rotY: 0 },
  { productId: 'p-side-table', pos: { x: 3550, y: 0, z: 700 }, rotY: 0 },
  { productId: 'p-wardrobe', pos: { x: 3980, y: 0, z: 3300 }, rotY: -90 },
  // ── 거실 ──
  { productId: 'p-sofa3', pos: { x: 6800, y: 0, z: 4300 }, rotY: 90 },
  { productId: 'p-rug', pos: { x: 6800, y: 0, z: 3000 }, rotY: 0 },
  { productId: 'p-coffee-table', pos: { x: 6800, y: 0, z: 2950 }, rotY: 0 },
  { productId: 'p-tv-wall', pos: { x: 4780, y: 900, z: 4300 }, rotY: 90 },
  { productId: 'p-dining-table', pos: { x: 9000, y: 0, z: 1700 }, rotY: 0 },
  { productId: 'p-chair', pos: { x: 8450, y: 0, z: 1700 }, rotY: 90 },
  { productId: 'p-chair', pos: { x: 9550, y: 0, z: 1700 }, rotY: -90 },
  { productId: 'p-fridge', pos: { x: 10230, y: 0, z: 480 }, rotY: 0 },
  { productId: 'p-sink-lower', pos: { x: 8700, y: 0, z: 320 }, rotY: 0 },
  { productId: 'p-sink-upper', pos: { x: 8700, y: 1450, z: 190 }, rotY: 0 },
  // ── 방2 ──
  { productId: 'p-desk', pos: { x: 700, y: 0, z: 5250 }, rotY: 90 },
  { productId: 'p-chair', pos: { x: 1350, y: 0, z: 5250 }, rotY: -90 },
  { productId: 'p-bed-single', pos: { x: 2100, y: 0, z: 6500 }, rotY: 180 },
  { productId: 'p-shelf-wall', pos: { x: 1400, y: 1400, z: 4720 }, rotY: 0 },
  // ── 현관 ──
  { productId: 'p-shoe-cabinet', pos: { x: 3720, y: 0, z: 4830 }, rotY: 180 },
]
