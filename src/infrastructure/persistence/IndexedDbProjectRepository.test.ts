import { describe, expect, it } from 'vitest'
import type { Project } from '../../domain/model'
import { LocalStorageProjectRepository } from './LocalStorageProjectRepository'
import {
  createDurableSessionProjectRepository,
  DurableSessionProjectRepository,
  migrateProjectRepository,
  type ProjectDatabase,
} from './IndexedDbProjectRepository'

const project = (id: string, name: string, updatedAt = '2026-08-31T00:00:00.000Z'): Project => ({
  version: 1,
  id,
  name,
  origin: 'blank',
  plan: { unit: 'mm', wallHeight: 2400, walls: [], openings: [], rooms: [] },
  placements: [],
  customProducts: [],
  createdAt: '2026-08-31T00:00:00.000Z',
  updatedAt,
})

class MemoryDatabase implements ProjectDatabase {
  readonly workspaces = new Map<string, Map<string, Project>>()

  async loadAll(workspaceId: string): Promise<Project[]> {
    return [...(this.workspaces.get(workspaceId)?.values() ?? [])].map((value) =>
      structuredClone(value)
    )
  }

  async put(workspaceId: string, value: Project): Promise<void> {
    const projects = this.workspaces.get(workspaceId) ?? new Map<string, Project>()
    projects.set(value.id!, structuredClone(value))
    this.workspaces.set(workspaceId, projects)
  }

  async delete(workspaceId: string, projectId: string): Promise<void> {
    this.workspaces.get(workspaceId)?.delete(projectId)
  }
}

describe('IndexedDB-backed 세션 프로젝트 저장소', () => {
  it('저장 후 같은 workspace를 다시 열면 프로젝트를 복구한다', async () => {
    const database = new MemoryDatabase()
    const first = new DurableSessionProjectRepository('session-a', database)
    first.save(project('p1', '영구 저장 우리집'))
    await first.flush()

    const reopened = await createDurableSessionProjectRepository({
      workspaceId: 'session-a',
      database,
      sessionRepository: new LocalStorageProjectRepository(new MemoryStorage()),
    })

    expect(reopened.load('p1')?.name).toBe('영구 저장 우리집')
  })

  it('workspace가 다르면 같은 프로젝트 ID도 공유하지 않는다', async () => {
    const database = new MemoryDatabase()
    const first = new DurableSessionProjectRepository('session-a', database)
    first.save(project('p1', 'A 세션'))
    await first.flush()

    const other = await createDurableSessionProjectRepository({
      workspaceId: 'session-b',
      database,
      sessionRepository: new LocalStorageProjectRepository(new MemoryStorage()),
    })

    expect(other.list()).toEqual([])
  })

  it('세션 캐시와 DB가 충돌하면 updatedAt이 최신인 프로젝트를 보존한다', async () => {
    const database = new MemoryDatabase()
    await database.put('session-a', project('p1', 'DB 과거', '2026-08-31T00:00:00.000Z'))
    const mirror = new LocalStorageProjectRepository(new MemoryStorage())
    mirror.save(project('p1', '세션 최신', '2026-08-31T01:00:00.000Z'))

    const repository = await createDurableSessionProjectRepository({
      workspaceId: 'session-a',
      database,
      sessionRepository: mirror,
    })
    await repository.flush()

    expect(repository.load('p1')?.name).toBe('세션 최신')
    expect((await database.loadAll('session-a'))[0].name).toBe('세션 최신')
  })

  it('삭제를 DB와 현재 탭 캐시에 함께 반영한다', async () => {
    const database = new MemoryDatabase()
    const mirror = new LocalStorageProjectRepository(new MemoryStorage())
    const repository = new DurableSessionProjectRepository('session-a', database, [], mirror)
    repository.save(project('p1', '삭제 대상'))
    await repository.flush()

    repository.delete('p1')
    await repository.flush()

    expect(repository.load('p1')).toBeNull()
    expect(mirror.load('p1')).toBeNull()
    expect(await database.loadAll('session-a')).toEqual([])
  })

  it('기존 unscoped 세션 프로젝트를 새 workspace 캐시로 옮기고 원본을 정리한다', () => {
    const legacy = new LocalStorageProjectRepository(new MemoryStorage())
    const scoped = new LocalStorageProjectRepository(new MemoryStorage())
    legacy.save(project('p1', '기존 세션'))

    migrateProjectRepository(legacy, scoped)

    expect(scoped.load('p1')?.name).toBe('기존 세션')
    expect(legacy.list()).toEqual([])
  })
})

class MemoryStorage {
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
