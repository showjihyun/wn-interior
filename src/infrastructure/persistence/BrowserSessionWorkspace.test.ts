import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from './LocalStorageProjectRepository'
import { resolveBrowserWorkspaceId } from './BrowserSessionWorkspace'

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
}

function resolve(href: string, storage = new MemoryStorage(), nextId = () => 'generated-session') {
  let replaced = ''
  const workspaceId = resolveBrowserWorkspaceId({
    location: { href },
    history: {
      replaceState: (_data, _unused, url) => {
        replaced = String(url)
      },
    },
    storage,
    nextId,
  })
  return { workspaceId, storage, replaced }
}

describe('브라우저 세션 workspace 식별', () => {
  it('URL workspace가 탭 저장값보다 우선하고 같은 URL 재접속 키가 된다', () => {
    const storage = new MemoryStorage()
    storage.setItem('hp3d.workspace', 'old-tab')

    const result = resolve('https://home.test/?workspace=shared-session', storage)

    expect(result.workspaceId).toBe('shared-session')
    expect(storage.getItem('hp3d.workspace')).toBe('shared-session')
    expect(result.replaced).toBe('')
  })

  it('새 접속은 새 workspace를 만들고 현재 URL에 기록한다', () => {
    const result = resolve('https://home.test/plan?mode=2d')

    expect(result.workspaceId).toBe('generated-session')
    expect(result.replaced).toContain('workspace=generated-session')
    expect(result.replaced).toContain('mode=2d')
  })

  it('같은 탭의 새로고침은 sessionStorage workspace를 재사용한다', () => {
    const storage = new MemoryStorage()
    storage.setItem('hp3d.workspace', 'tab-session')

    expect(resolve('https://home.test/', storage).workspaceId).toBe('tab-session')
  })
})
