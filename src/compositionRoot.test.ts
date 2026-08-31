import { beforeEach, describe, expect, it } from 'vitest'
import { createApplicationComposition } from './compositionRoot'

describe('브라우저 접속 세션별 프로젝트 저장소', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('프로젝트를 현재 세션에 저장하고 같은 세션의 새 런타임에서 다시 연다', () => {
    const first = createApplicationComposition()
    first.runtime.store.getState().newProject('세션 전용 우리집')

    expect(sessionStorage.getItem('hp3d.index')).not.toBeNull()
    expect(localStorage.getItem('hp3d.index')).toBeNull()

    const restored = createApplicationComposition()
    expect(restored.runtime.store.getState().projectName).toBe('세션 전용 우리집')
  })
})
