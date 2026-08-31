// 계약 테스트 — 프로젝트 저장소 어댑터 (현재 localStorage, 향후 DB 교체)
import { describe, it, expect, beforeEach } from 'vitest'
import { LocalStorageProjectRepository as LocalStorageAdapter } from './LocalStorageProjectRepository'
import { SessionStorageProjectRepository } from './LocalStorageProjectRepository'
import type { Project } from '../../domain/model'

function makeProject(id: string, name: string, wallCount = 1): Project {
  return {
    version: 1,
    id,
    name,
    plan: {
      unit: 'mm',
      wallHeight: 2400,
      walls: Array.from({ length: wallCount }, (_, i) => ({
        id: `w${i}`,
        a: { x: 0, y: 0 },
        b: { x: 1000, y: 0 },
        thickness: 120,
      })),
      openings: [],
      rooms: [],
    },
    placements: [],
    customProducts: [],
    createdAt: '2026-08-25T00:00:00Z',
    updatedAt: '2026-08-25T00:00:00Z',
  }
}

describe('LocalStorageAdapter (프로젝트별 저장)', () => {
  let a: LocalStorageAdapter
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    a = new LocalStorageAdapter()
  })

  it('save -> list -> load 사이클', () => {
    a.save(makeProject('p1', '우리집'))
    const list = a.list()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('p1')
    expect(list[0].name).toBe('우리집')
    const loaded = a.load('p1')!
    expect(loaded.name).toBe('우리집')
    expect(loaded.plan.walls).toHaveLength(1)
  })

  it('프로젝트별로 완전히 분리된다 (세션 격리)', () => {
    a.save(makeProject('p1', 'A안'))
    a.save(makeProject('p2', 'B안', 5))
    expect(a.list()).toHaveLength(2)
    expect(a.load('p1')!.plan.walls).toHaveLength(1)
    expect(a.load('p2')!.plan.walls).toHaveLength(5)
    a.delete('p1')
    expect(a.list().map((m) => m.id)).toEqual(['p2'])
    expect(a.load('p1')).toBeNull()
  })

  it('같은 id 재저장 시 덮어쓰고 updatedAt이 갱신된다', async () => {
    a.save(makeProject('p1', 'v1'))
    const before = a.list()[0].updatedAt
    await new Promise((r) => setTimeout(r, 5))
    a.save({ ...makeProject('p1', 'v2'), updatedAt: new Date().toISOString() })
    const meta = a.list()[0]
    expect(meta.name).toBe('v2')
    expect(meta.updatedAt >= before).toBe(true)
  })

  it('없는 id 로드는 null', () => {
    expect(a.load('nope')).toBeNull()
  })

  it('손상된 인덱스/데이터가 있어도 예외 없이 복구', () => {
    localStorage.setItem('hp3d.index', 'not-json')
    expect(a.list()).toEqual([])
    localStorage.setItem('hp3d.proj.broken', 'not-json')
    a.save(makeProject('p9', '정상'))
    expect(a.load('p9')!.name).toBe('정상')
  })

  it('목록을 순회해 전체 프로젝트를 삭제할 수 있다', () => {
    a.save(makeProject('p1', 'x'))
    a.save(makeProject('p2', 'y'))
    for (const project of a.list()) a.delete(project.id)
    expect(a.list()).toHaveLength(0)
  })

  it('workspace별 sessionStorage 캐시는 같은 탭에서도 서로 섞이지 않는다', () => {
    const workspaceA = new SessionStorageProjectRepository(sessionStorage, 'hp3d.workspace.a')
    const workspaceB = new SessionStorageProjectRepository(sessionStorage, 'hp3d.workspace.b')

    workspaceA.save(makeProject('p1', 'A 전용'))

    expect(workspaceA.load('p1')?.name).toBe('A 전용')
    expect(workspaceB.list()).toEqual([])
    expect(workspaceB.load('p1')).toBeNull()
  })
})
