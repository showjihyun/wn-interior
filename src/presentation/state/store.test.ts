import { describe, it, expect, beforeEach } from 'vitest'
import { createApplicationComposition } from '../../compositionRoot'
import { CATALOG } from '../../infrastructure/reference-data/data/catalog'
import { roomAt } from '../../domain/engine/geom'

const { runtime } = createApplicationComposition()
const useStore = runtime.store
const S = () => useStore.getState()

describe('스토어 — 배치/Undo/Redo', () => {
  beforeEach(() => {
    S().resetToSample()
    useStore.setState({
      placements: [],
      past: [],
      future: [],
      variants: [],
      customProducts: [],
    })
  })

  it('제품을 배치하면 placements에 추가되고 선택된다', () => {
    const id = S().addPlacement('p-sofa3', { x: 9000, z: 5000 })
    expect(id).not.toBeNull()
    expect(S().placements.some((p) => p.id === id)).toBe(true)
    expect(S().selectedId).toBe(id)
  })

  it('초기 배치를 스토어 경계에서 검증하고 확정된 방 ID를 함께 저장한다', () => {
    useStore.setState({ placements: [], past: [], future: [], toast: null })
    const expectedRoom = roomAt(S().plan, 9000, 5000)

    const id = S().addPlacement('p-sofa3', { x: 9000, z: 5000 })

    expect(expectedRoom).toBeDefined()
    expect(id).not.toBeNull()
    expect(S().placements).toHaveLength(1)
    expect(S().placements[0].roomId).toBe(expectedRoom?.id)
  })

  it('방 밖이나 기존 가구와 겹치는 초기 배치는 상태와 히스토리에 남기지 않는다', () => {
    useStore.setState({ placements: [], past: [], future: [], toast: null })

    const outsideId = S().addPlacement('p-sofa3', { x: 12000, z: 9000 })

    expect(outsideId).toBeNull()
    expect(S().placements).toHaveLength(0)
    expect(S().past).toHaveLength(0)

    const validId = S().addPlacement('p-sofa3', { x: 9000, z: 5000 })
    const historyAfterValid = S().past.length
    const collisionId = S().addPlacement('p-chair', { x: 9000, z: 5000 })

    expect(validId).not.toBeNull()
    expect(collisionId).toBeNull()
    expect(S().placements).toHaveLength(1)
    expect(S().past).toHaveLength(historyAfterValid)
  })

  it('undo는 마지막 커밋을 되돌린다', () => {
    const before = S().placements.length
    S().addPlacement('p-chair', { x: 6000, z: 2000 })
    expect(S().placements.length).toBe(before + 1)
    S().undo()
    expect(S().placements.length).toBe(before)
    S().redo()
    expect(S().placements.length).toBe(before + 1)
  })

  it('removePlacement 후 undo로 복원된다', () => {
    const id = S().addPlacement('p-chair', { x: 9000, z: 5000 })
    S().removePlacement(id!)
    expect(S().placements.some((p) => p.id === id)).toBe(false)
    S().undo()
    expect(S().placements.some((p) => p.id === id)).toBe(true)
  })

  it('드래그 이동(move)은 히스토리를 만들지 않고, updatePlacement 커밋 1회만 기록된다', () => {
    const id = S().addPlacement('p-chair', { x: 9000, z: 5000 })!
    const histLen = S().past.length
    S().movePlacement(id, 9200, 5200) // 드래그 중
    expect(S().past.length).toBe(histLen)
    const moved = S().placements.find((p) => p.id === id)!
    S().updatePlacement(id, { pos: moved.pos }) // 드롭 시점
    expect(S().past.length).toBe(histLen + 1)
  })
})

describe('스토어 — 배치안(variants)', () => {
  beforeEach(() => {
    S().resetToSample()
    useStore.setState({ variants: [], customProducts: [] })
  })

  it('현재 배치를 저장하고 적용하면 배치가 교체된다', () => {
    // A안 상태 저장
    S().saveVariant('A안')
    const aCount = S().placements.length
    // 변경: 제품 하나 추가 → B안
    S().addPlacement('p-armchair', { x: 9000, z: 5000 })
    S().saveVariant('B안')
    expect(S().variants).toHaveLength(2)
    // A안으로 복귀
    const aId = S().variants[0].id
    S().applyVariant(aId)
    expect(S().placements.length).toBe(aCount)
    expect(S().placements.some((p) => p.productId === 'p-armchair')).toBe(false)
  })

  it('적용은 undo 가능하다', () => {
    const base = S().placements.length
    S().saveVariant('v1')
    S().addPlacement('p-pendant', { x: 6800, z: 4000 })
    S().applyVariant(S().variants[0].id)
    expect(S().placements.length).toBe(base)
    S().undo()
    expect(S().placements.length).toBe(base + 1)
  })

  it('삭제할 수 있다', () => {
    S().saveVariant('x')
    const n = S().variants.length
    S().removeVariant(S().variants[0].id)
    expect(S().variants.length).toBe(n - 1)
  })

  it('배치 순서와 이름만 다른 동일 상태는 중복 저장하지 않고 기존 안을 알려준다', () => {
    S().saveVariant('A안')
    useStore.setState({ placements: [...S().placements].reverse() })

    const duplicate = S().saveVariant('B안') as any

    expect(duplicate).toEqual({ saved: false, duplicateName: 'A안' })
    expect(S().variants).toHaveLength(1)

    const first = S().placements[0]
    S().updatePlacement(first.id, { rotY: first.rotY + 15 })
    const changed = S().saveVariant('B안') as any
    expect(changed).toEqual({ saved: true })
    expect(S().variants).toHaveLength(2)
  })
})

describe('스토어 — 커스텀 제품', () => {
  beforeEach(() => {
    S().resetToSample()
    useStore.setState({ variants: [], customProducts: [] })
  })

  it('실측 치수로 등록되고 productById로 조회된다', () => {
    const id = S().addCustomProduct({
      name: '우리집 소파',
      category: 'custom',
      dims: { w: 1600, d: 800, h: 750 },
      mount: 'floor',
      shape: 'box',
    })
    const prod = S().productById(id)
    expect(prod?.dims).toEqual({ w: 1600, d: 800, h: 750 })
  })

  it('기본 카탈로그와 합쳐져 총 개수가 증가한다', () => {
    const base = CATALOG.length
    S().addCustomProduct({
      name: 't1',
      category: 'custom',
      dims: { w: 1, d: 1, h: 1 },
      mount: 'floor',
      shape: 'box',
    })
    expect(base + S().customProducts.length).toBeGreaterThan(base)
  })
})

describe('스토어 — 회귀 (E2E에서 발견된 버그)', () => {
  beforeEach(() => {
    S().resetToSample()
    useStore.setState({
      placements: [],
      past: [],
      future: [],
      variants: [],
      customProducts: [],
    })
  })

  it('setPending(null)은 배치 직후의 선택을 지우지 않는다', () => {
    // 버그: 고스트 클릭 → addPlacement(선택 설정) → setPending(null)이 선택을 덮어씀
    S().addPlacement('p-sofa3', { x: 9000, z: 5000 })
    const selBefore = S().selectedId
    expect(selBefore).not.toBeNull()
    S().setPending(null)
    expect(S().selectedId).toBe(selBefore)
  })

  it('새 pending 제품 지정 시엔 기존 선택이 해제된다', () => {
    S().addPlacement('p-sofa3', { x: 9000, z: 5000 })
    expect(S().selectedId).not.toBeNull()
    S().setPending('p-bed-queen')
    expect(S().selectedId).toBeNull()
    expect(S().pendingProductId).toBe('p-bed-queen')
  })
})

describe('스토어 — 애플리케이션 경계 위임', () => {
  it('새 프로젝트를 만들고 기존 프로젝트를 다시 열 수 있다', () => {
    const originalId = S().projectId

    S().newProject('클린 아키텍처 테스트')
    const createdId = S().projectId

    expect(createdId).not.toBe(originalId)
    expect(S().projectName).toBe('클린 아키텍처 테스트')
    expect(S().mode).toBe('2d')
    expect(S().projects.some((project) => project.id === createdId)).toBe(true)

    S().openProject(originalId)
    expect(S().projectId).toBe(originalId)
  })

  it('현재 프로젝트를 삭제하면 남은 프로젝트를 열어 복구한다', () => {
    S().newProject('삭제 대상')
    const deletedId = S().projectId

    S().deleteProject(deletedId)

    expect(S().projectId).not.toBe(deletedId)
    expect(S().projects.some((project) => project.id === deletedId)).toBe(false)
  })

  it('AI 설정 변경은 상태 경계를 통해 반영된다', () => {
    S().setAi({ model: 'test/model' })

    expect(S().ai.model).toBe('test/model')
  })

  it('추정 축척 검수가 끝나지 않으면 어떤 진입점에서도 3D 모드로 바꾸지 않는다', () => {
    useStore.setState({
      mode: '2d',
      floorPlanReview: {
        sourceImageDataUrl: 'data:image/jpeg;base64,review',
        sourceWidth: 800,
        sourceHeight: 560,
        mmPerPx: 20,
        scaleMode: 'estimated',
        requiredFor3d: true,
        status: 'pending',
      },
      toast: null,
    } as any)

    S().setMode('3d')

    expect(S().mode).toBe('2d')
    expect(S().toast?.msg).toContain('2D 검수')
  })

  it('CV 프로젝트를 불러오면 원본 비교와 검수 상태를 보존한다', () => {
    useStore.setState({ floorPlanReview: undefined } as any)
    const review = {
      sourceImageDataUrl: 'data:image/jpeg;base64,review',
      sourceWidth: 800,
      sourceHeight: 560,
      mmPerPx: 20,
      scaleMode: 'estimated',
      requiredFor3d: true,
      status: 'pending',
    }
    const project = { ...S().exportProject(), origin: 'cv', floorPlanReview: review }

    S().loadProject(project as any)

    expect((S() as any).floorPlanReview).toEqual(review)
  })
})
