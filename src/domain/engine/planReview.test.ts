import { describe, expect, it } from 'vitest'
import {
  assessScale,
  buildPlanReviewIssues,
  getPlanWidthMm,
  sanitizeOpeningCandidates,
} from './planReview'
import type { RawPlan } from './planVision'

const plan = (overrides: Partial<RawPlan> = {}): RawPlan => ({
  wallHeight: 2400,
  walls: [
    { a: { x: -100, y: 0 }, b: { x: 2900, y: 0 }, thickness: 120 },
    { a: { x: 2900, y: 0 }, b: { x: 2900, y: 2000 }, thickness: 120 },
  ],
  openings: [{ type: 'door', at: { x: 1000, y: 0 }, width: 900 }],
  rooms: [
    {
      name: '거실',
      polygon: [
        { x: 0, y: 0 },
        { x: 2800, y: 0 },
        { x: 2800, y: 1800 },
        { x: 0, y: 1800 },
      ],
      areaM2: 5.04,
    },
    {
      name: '방1',
      polygon: [
        { x: 0, y: 0 },
        { x: 1400, y: 0 },
        { x: 1400, y: 900 },
        { x: 0, y: 900 },
      ],
      areaM2: 1.26,
    },
  ],
  mmPerPx: 10,
  ...overrides,
})

describe('평면도 축척 적용 게이트', () => {
  it('벽 외곽의 실제 검출 폭을 음수 원점과 무관하게 계산한다', () => {
    expect(getPlanWidthMm(plan())).toBe(3000)
  })

  it('벽이 없거나 모든 x 좌표가 같으면 유효한 가로 폭이 없다고 판단한다', () => {
    expect(getPlanWidthMm({ walls: [] })).toBe(0)
    expect(
      getPlanWidthMm({
        walls: [{ a: { x: 10, y: 0 }, b: { x: 10, y: 100 }, thickness: 100 }],
      })
    ).toBe(0)
  })

  it('실측값도 추정 축척 확인도 없으면 적용을 차단한다', () => {
    const result = assessScale({
      detectedWidthMm: 3289,
      knownWidthMm: 0,
      acceptEstimatedScale: false,
    })
    expect(result.mode).toBe('blocked')
    expect(result.canApply).toBe(false)
    expect(result.detectedWidthMm).toBe(3289)
  })

  it('실측값을 입력하면 보정 배율과 적용 가능 상태를 반환한다', () => {
    const result = assessScale({
      detectedWidthMm: 3289,
      knownWidthMm: 11800,
      acceptEstimatedScale: false,
    })
    expect(result.mode).toBe('calibrated')
    expect(result.canApply).toBe(true)
    if (result.mode !== 'calibrated') throw new Error('calibrated expected')
    expect(result.correctionFactor).toBeCloseTo(3.588, 3)
    expect(result.knownWidthMm).toBe(11800)
  })

  it('사용자가 위험을 명시적으로 확인한 경우에만 추정 축척을 허용한다', () => {
    const result = assessScale({
      detectedWidthMm: 3289,
      knownWidthMm: 0,
      acceptEstimatedScale: true,
    })
    expect(result.mode).toBe('estimated')
    expect(result.canApply).toBe(true)
    if (result.mode !== 'estimated') throw new Error('estimated expected')
    expect(result.correctionFactor).toBe(1)
  })
})

describe('변환 결과 사전 검토', () => {
  it('벽·방이 없으면 적용 차단 문제로 분류한다', () => {
    const scale = assessScale({
      detectedWidthMm: 0,
      knownWidthMm: 0,
      acceptEstimatedScale: false,
    })
    const issues = buildPlanReviewIssues(plan({ walls: [], rooms: [], openings: [] }), scale)
    expect(issues.filter((issue) => issue.severity === 'blocker').map((issue) => issue.id)).toEqual(
      expect.arrayContaining(['no-walls', 'no-rooms', 'scale-blocked'])
    )
  })

  it('방 1개·개구부 0개·추정 축척은 사용자 검토 경고로 노출한다', () => {
    const scale = assessScale({
      detectedWidthMm: 3000,
      knownWidthMm: 0,
      acceptEstimatedScale: true,
    })
    const issues = buildPlanReviewIssues(
      plan({ rooms: plan().rooms.slice(0, 1), openings: [] }),
      scale
    )
    expect(issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining(['few-rooms', 'no-openings', 'estimated-scale'])
    )
  })

  it('축척 보정 폭이 2배를 넘으면 실측값 재확인 경고를 추가한다', () => {
    const scale = assessScale({
      detectedWidthMm: 3289,
      knownWidthMm: 11800,
      acceptEstimatedScale: false,
    })
    const issues = buildPlanReviewIssues(plan(), scale)
    expect(issues.find((issue) => issue.id === 'large-scale-correction')?.value).toBeCloseTo(
      3.588,
      3
    )
  })

  it('정상 검출과 작은 축척 보정에는 불필요한 경고를 만들지 않는다', () => {
    const scale = assessScale({
      detectedWidthMm: 3000,
      knownWidthMm: 3300,
      acceptEstimatedScale: false,
    })
    expect(buildPlanReviewIssues(plan(), scale)).toEqual([])
  })
})

describe('축척 보정 후 문·창문 보존', () => {
  it('큰 보정 배율로 폭이 상한을 넘더라도 후보를 삭제하지 않고 지원 범위로 제한한다', () => {
    expect(
      sanitizeOpeningCandidates([
        { type: 'door', at: { x: 100, y: 0 }, width: 2513 },
        { type: 'window', at: { x: 200, y: 0 }, width: 6100 },
      ])
    ).toEqual([
      { type: 'door', at: { x: 100, y: 0 }, width: 2200 },
      { type: 'window', at: { x: 200, y: 0 }, width: 5000 },
    ])
  })

  it('0·음수·비정상 폭만 제거하고 작은 폭은 최소 지원값으로 보정한다', () => {
    expect(
      sanitizeOpeningCandidates([
        { type: 'door', at: { x: 100, y: 0 }, width: 0 },
        { type: 'door', at: { x: 200, y: 0 }, width: 320 },
        { type: 'window', at: { x: 300, y: 0 }, width: Number.NaN },
      ])
    ).toEqual([{ type: 'door', at: { x: 200, y: 0 }, width: 500 }])
  })
})
