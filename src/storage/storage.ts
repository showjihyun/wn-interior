// 프로젝트 저장소 어댑터
// 지금: LocalStorageAdapter (브라우저별 세션 격리)
// 나중: DbAdapter (계정별 CRUD) - StorageAdapter 인터페이스만 구현하면 교체 가능
import type { Project } from '../types'

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: string
  createdAt: string
}

export interface StorageAdapter {
  list(): ProjectMeta[]
  load(id: string): Project | null
  save(project: Project): void
  delete(id: string): void
}

const INDEX_KEY = 'hp3d.index'
const projKey = (id: string) => `hp3d.proj.${id}`

export class LocalStorageAdapter implements StorageAdapter {
  list(): ProjectMeta[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY)
      const arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }

  load(id: string): Project | null {
    try {
      const raw = localStorage.getItem(projKey(id))
      if (!raw) return null
      const p = JSON.parse(raw) as Project
      if (!p?.plan?.walls) return null
      return p
    } catch {
      return null
    }
  }

  save(project: Project): void {
    if (!project.id) throw new Error('project.id required')
    const meta: ProjectMeta = {
      id: project.id,
      name: project.name,
      updatedAt: new Date().toISOString(),
      createdAt: project.createdAt,
    }
    localStorage.setItem(projKey(project.id), JSON.stringify(project))
    const list = this.list().filter((m) => m.id !== project.id)
    list.unshift(meta)
    localStorage.setItem(INDEX_KEY, JSON.stringify(list))
  }

  delete(id: string): void {
    localStorage.removeItem(projKey(id))
    localStorage.setItem(INDEX_KEY, JSON.stringify(this.list().filter((m) => m.id !== id)))
  }
}

export function clearAllProjects(): void {
  for (const m of new LocalStorageAdapter().list()) localStorage.removeItem(projKey(m.id))
  localStorage.removeItem(INDEX_KEY)
}

/** 활성 어댑터 — DB 전환 시 이 심볼만 교체 */
export const storage: StorageAdapter = new LocalStorageAdapter()
