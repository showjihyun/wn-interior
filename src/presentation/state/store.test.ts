import { describe, it, expect, beforeEach } from 'vitest'
import { createApplicationComposition } from '../../compositionRoot'
import { CATALOG } from '../../infrastructure/reference-data/data/catalog'

const { runtime } = createApplicationComposition()
const useStore = runtime.store
const S = () => useStore.getState()

describe('스토어 — 배치/Undo/Redo', () => {
  beforeEach(() => {
    S().resetToSample()
    useStore.setState({ variants: [], customProducts: [] })
  })

  it('제품을 배치하면 placements에 추가되고 선택된다', () => {
    const id = S().addPlacement('p-sofa3', { x: 5000, z: 3000 })
    expect(id).not.toBeNull()
    expect(S().placements.some((p) => p.id === id)).toBe(true)
    expect(S().selectedId).toBe(id)
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
    const id = S().addPlacement('p-rug', { x: 5000, z: 3000 })
    S().removePlacement(id!)
    expect(S().placements.some((p) => p.id === id)).toBe(false)
    S().undo()
    expect(S().placements.some((p) => p.id === id)).toBe(true)
  })

  it('드래그 이동(move)은 히스토리를 만들지 않고, updatePlacement 커밋 1회만 기록된다', () => {
    const id = S().addPlacement('p-desk', { x: 1000, z: 5500 })!
    const histLen = S().past.length
    S().movePlacement(id, 1200, 5700) // 드래그 중
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
    useStore.setState({ variants: [], customProducts: [] })
  })

  it('setPending(null)은 배치 직후의 선택을 지우지 않는다', () => {
    // 버그: 고스트 클릭 → addPlacement(선택 설정) → setPending(null)이 선택을 덮어씀
    S().addPlacement('p-sofa3', { x: 5000, z: 3000 })
    const selBefore = S().selectedId
    expect(selBefore).not.toBeNull()
    S().setPending(null)
    expect(S().selectedId).toBe(selBefore)
  })

  it('새 pending 제품 지정 시엔 기존 선택이 해제된다', () => {
    S().addPlacement('p-sofa3', { x: 5000, z: 3000 })
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
})
