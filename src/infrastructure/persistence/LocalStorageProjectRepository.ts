import type { Project } from '../../domain/model'
import type { ProjectMeta, ProjectRepository } from '../../application/ports'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const INDEX_KEY = 'hp3d.index'
const projKey = (id: string) => `hp3d.proj.${id}`
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object'
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const point = (value: unknown) => record(value) && finite(value.x) && finite(value.y)

export function decodeProjectDocument(value: unknown, requireId = true): Project | null {
  if (!record(value) || value.version !== 1 || typeof value.name !== 'string') return null
  if (requireId && typeof value.id !== 'string') return null
  if (!record(value.plan) || value.plan.unit !== 'mm' || !finite(value.plan.wallHeight)) return null
  if (
    !Array.isArray(value.plan.walls) ||
    !value.plan.walls.every(
      (wall) =>
        record(wall) &&
        typeof wall.id === 'string' &&
        point(wall.a) &&
        point(wall.b) &&
        finite(wall.thickness)
    ) ||
    !Array.isArray(value.plan.openings) ||
    !Array.isArray(value.plan.rooms) ||
    !Array.isArray(value.placements) ||
    !Array.isArray(value.customProducts) ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null
  }
  return value as unknown as Project
}

function decodeMeta(value: unknown): ProjectMeta | null {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null
  }
  return value as unknown as ProjectMeta
}

export class LocalStorageProjectRepository implements ProjectRepository {
  constructor(private readonly storage: KeyValueStorage = localStorage) {}

  list(): ProjectMeta[] {
    try {
      const raw = this.storage.getItem(INDEX_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (!Array.isArray(parsed)) return []
      return parsed.map(decodeMeta).filter((meta): meta is ProjectMeta => meta !== null)
    } catch {
      return []
    }
  }

  load(id: string): Project | null {
    try {
      const raw = this.storage.getItem(projKey(id))
      return raw ? decodeProjectDocument(JSON.parse(raw)) : null
    } catch {
      return null
    }
  }

  save(project: Project): void {
    if (!project.id) throw new Error('project.id required')
    const meta: ProjectMeta = {
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
    }
    this.storage.setItem(projKey(project.id), JSON.stringify(project))
    const list = this.list().filter((candidate) => candidate.id !== project.id)
    list.unshift(meta)
    this.storage.setItem(INDEX_KEY, JSON.stringify(list))
  }

  delete(id: string): void {
    this.storage.removeItem(projKey(id))
    this.storage.setItem(
      INDEX_KEY,
      JSON.stringify(this.list().filter((candidate) => candidate.id !== id))
    )
  }
}

export class SessionStorageProjectRepository extends LocalStorageProjectRepository {
  constructor(storage: KeyValueStorage = sessionStorage) {
    super(storage)
  }
}
