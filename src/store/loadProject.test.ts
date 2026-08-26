// 버그 회귀 테스트 - loadProject가 기존 프로젝트를 덮어쓰면 안 됨
import { describe, it, expect } from 'vitest'
import { useStore } from './store'
import { storage } from '../storage/storage'

const emptyPlan = { unit: 'mm' as const, wallHeight: 2400, walls: [], openings: [], rooms: [] }

describe('loadProject 격리 (AI/CV 결과는 새 프로젝트로)', () => {
  it('외부 콘텐츠 로드 시 새 id로 저장되고 기존 프로젝트를 보존한다', () => {
    const s = useStore.getState()
    s.resetToSample()
    const origId = s.projectId
    const origName = storage.load(origId)!.name

    s.loadProject({
      version: 1,
      name: 'CV 도면 변환',
      plan: JSON.parse(JSON.stringify(emptyPlan)),
      placements: [],
      customProducts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const st = useStore.getState()
    expect(st.projectId).not.toBe(origId)
    expect(st.projectName).toBe('CV 도면 변환')
    // 기존 프로젝트 보존
    expect(storage.load(origId)!.name).toBe(origName)
    // 새 프로젝트도 저장됨
    expect(storage.load(st.projectId)!.name).toBe('CV 도면 변환')
  })

  it('id가 포함된 프로젝트 로드는 해당 id를 유지한다', () => {
    const before = useStore.getState().projectId
    useStore.getState().loadProject({
      version: 1,
      id: 'explicit-1',
      name: '명시적',
      plan: JSON.parse(JSON.stringify(emptyPlan)),
      placements: [],
      customProducts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    expect(useStore.getState().projectId).toBe('explicit-1')
    void before
  })
})
