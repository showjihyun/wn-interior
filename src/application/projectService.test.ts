import { describe, expect, it } from 'vitest'
import type { Project } from '../domain/model'
import type {
  Clock,
  IdGenerator,
  LegacyProjectSource,
  ProjectMeta,
  ProjectRepository,
  StarterProjectProvider,
} from './ports'
import { createProjectService } from './projectService'

class MemoryProjects implements ProjectRepository {
  readonly values = new Map<string, Project>()

  list(): ProjectMeta[] {
    return [...this.values.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((project) => ({
        id: project.id!,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }))
  }

  load(id: string): Project | null {
    return this.values.get(id) ?? null
  }

  save(project: Project): void {
    this.values.set(project.id!, project)
  }

  delete(id: string): void {
    this.values.delete(id)
  }
}

function dependencies(legacyProject: Project | null = null) {
  const repository = new MemoryProjects()
  let sequence = 0
  const ids: IdGenerator = { next: () => `id-${++sequence}` }
  const clock: Clock = { now: () => '2026-08-28T00:00:00.000Z' }
  let removed = false
  const legacySource: LegacyProjectSource = {
    load: () => legacyProject,
    remove: () => {
      removed = true
    },
  }
  const starterProjectProvider: StarterProjectProvider = {
    getStarterProject: () => ({
      name: '주입된 시작 프로젝트',
      plan: {
        unit: 'mm',
        wallHeight: 2700,
        walls: [
          {
            id: 'starter-wall',
            a: { x: 0, y: 0 },
            b: { x: 4200, y: 0 },
            thickness: 200,
          },
        ],
        openings: [],
        rooms: [],
      },
      placements: [
        {
          productId: 'starter-product',
          pos: { x: 1000, y: 0, z: 1000 },
          rotY: 0,
        },
      ],
      customProducts: [],
    }),
  }
  return {
    repository,
    service: createProjectService({
      repository,
      legacySource,
      ids,
      clock,
      starterProjectProvider,
    }),
    legacyRemoved: () => removed,
  }
}

const emptyProject = (id?: string): Project => ({
  version: 1,
  id,
  name: '가져온 도면',
  plan: { unit: 'mm', wallHeight: 2400, walls: [], openings: [], rooms: [] },
  placements: [],
  customProducts: [],
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
})

describe('ProjectService', () => {
  it('저장된 프로젝트가 없으면 주입된 시작 프로젝트를 새 ID로 만든다', () => {
    const { repository, service } = dependencies()

    const project = service.initialize()

    expect(project.id).toBe('id-1')
    expect(project.name).toBe('주입된 시작 프로젝트')
    expect(project.plan.walls).toHaveLength(1)
    expect(project.plan.walls[0].id).toBe('starter-wall')
    expect(project.placements[0]).toMatchObject({
      id: 'id-2',
      productId: 'starter-product',
    })
    expect(repository.load('id-1')).toEqual(project)
  })

  it('구버전 단일 슬롯을 새 ID로 이관하고 원본 슬롯을 제거한다', () => {
    const { repository, service, legacyRemoved } = dependencies(emptyProject())

    const project = service.initialize()

    expect(project.id).toBe('id-1')
    expect(repository.load('id-1')?.name).toBe('가져온 도면')
    expect(legacyRemoved()).toBe(true)
  })

  it('현재 프로젝트와 같은 ID의 외부 콘텐츠는 별도 프로젝트로 저장한다', () => {
    const { repository, service } = dependencies()

    const imported = service.importProject(emptyProject('current'))

    expect(imported.id).toBe('id-1')
    expect(repository.load('id-1')).toEqual(imported)
    expect(imported.updatedAt).toBe('2026-08-28T00:00:00.000Z')
  })

  it('상태 스냅샷 저장 시 최초 생성일은 보존하고 갱신 시각만 바꾼다', () => {
    const { repository, service } = dependencies()
    repository.save(emptyProject('p1'))

    service.save({
      id: 'p1',
      name: '수정됨',
      plan: emptyProject().plan,
      placements: [],
      customProducts: [],
    })

    expect(repository.load('p1')).toMatchObject({
      name: '수정됨',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
    })
  })
})
