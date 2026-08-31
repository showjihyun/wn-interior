import type { ProjectMeta, ProjectRepository } from '../../application/ports'
import type { Project } from '../../domain/model'
import { decodeProjectDocument } from './LocalStorageProjectRepository'

const DATABASE_NAME = 'homeplan3d'
const DATABASE_VERSION = 1
const PROJECT_STORE = 'projects'
const WORKSPACE_INDEX = 'workspaceId'

interface StoredProjectRecord {
  key: string
  workspaceId: string
  project: Project
}

export interface ProjectDatabase {
  loadAll(workspaceId: string): Promise<Project[]>
  put(workspaceId: string, project: Project): Promise<void>
  delete(workspaceId: string, projectId: string): Promise<void>
}

export interface FlushableProjectRepository extends ProjectRepository {
  flush(): Promise<void>
}

const recordKey = (workspaceId: string, projectId: string) => `${workspaceId}:${projectId}`

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb-request-failed'))
  })

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('indexeddb-aborted'))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('indexeddb-transaction-failed'))
  })

export class IndexedDbProjectDatabase implements ProjectDatabase {
  private connection?: Promise<IDBDatabase>

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection
    this.connection = new Promise((resolve, reject) => {
      const request = this.factory.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(PROJECT_STORE)) {
          const store = database.createObjectStore(PROJECT_STORE, { keyPath: 'key' })
          store.createIndex(WORKSPACE_INDEX, WORKSPACE_INDEX, { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('indexeddb-open-failed'))
      request.onblocked = () => reject(new Error('indexeddb-open-blocked'))
    })
    return this.connection
  }

  async loadAll(workspaceId: string): Promise<Project[]> {
    const database = await this.open()
    const transaction = database.transaction(PROJECT_STORE, 'readonly')
    const done = transactionDone(transaction)
    const index = transaction.objectStore(PROJECT_STORE).index(WORKSPACE_INDEX)
    const records = await requestResult(index.getAll(IDBKeyRange.only(workspaceId)))
    await done
    return (records as StoredProjectRecord[])
      .map((record) => decodeProjectDocument(record.project))
      .filter((project): project is Project => project !== null)
  }

  async put(workspaceId: string, project: Project): Promise<void> {
    if (!project.id) throw new Error('project.id required')
    const database = await this.open()
    const transaction = database.transaction(PROJECT_STORE, 'readwrite')
    transaction.objectStore(PROJECT_STORE).put({
      key: recordKey(workspaceId, project.id),
      workspaceId,
      project: structuredClone(project),
    } satisfies StoredProjectRecord)
    await transactionDone(transaction)
  }

  async delete(workspaceId: string, projectId: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(PROJECT_STORE, 'readwrite')
    transaction.objectStore(PROJECT_STORE).delete(recordKey(workspaceId, projectId))
    await transactionDone(transaction)
  }
}

const metaOf = (project: Project): ProjectMeta => ({
  id: project.id!,
  name: project.name,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
})

export class DurableSessionProjectRepository implements FlushableProjectRepository {
  private readonly projects = new Map<string, Project>()
  private pending: Promise<void> = Promise.resolve()
  private failure: unknown

  constructor(
    private readonly workspaceId: string,
    private readonly database: ProjectDatabase,
    projects: Project[] = [],
    private readonly mirror?: ProjectRepository
  ) {
    projects.forEach((project) => {
      if (!project.id) return
      this.projects.set(project.id, structuredClone(project))
      this.mirror?.save(project)
    })
  }

  list(): ProjectMeta[] {
    return [...this.projects.values()]
      .map(metaOf)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  load(id: string): Project | null {
    const project = this.projects.get(id)
    return project ? structuredClone(project) : null
  }

  save(project: Project): void {
    if (!project.id) throw new Error('project.id required')
    const snapshot = structuredClone(project)
    this.projects.set(project.id, snapshot)
    this.mirror?.save(snapshot)
    this.enqueue(() => this.database.put(this.workspaceId, snapshot))
  }

  delete(id: string): void {
    this.projects.delete(id)
    this.mirror?.delete(id)
    this.enqueue(() => this.database.delete(this.workspaceId, id))
  }

  async flush(): Promise<void> {
    await this.pending
    if (this.failure) throw this.failure
  }

  private enqueue(operation: () => Promise<void>) {
    this.pending = this.pending.then(operation).catch((error: unknown) => {
      this.failure = error
    })
  }
}

const newestById = (projects: Project[]): Project[] => {
  const merged = new Map<string, Project>()
  projects.forEach((project) => {
    if (!project.id) return
    const current = merged.get(project.id)
    if (!current || project.updatedAt > current.updatedAt) merged.set(project.id, project)
  })
  return [...merged.values()]
}

export function migrateProjectRepository(
  source: ProjectRepository,
  target: ProjectRepository
): void {
  source.list().forEach((meta) => {
    const project = source.load(meta.id)
    if (!project) return
    const existing = target.load(meta.id)
    if (!existing || project.updatedAt > existing.updatedAt) target.save(project)
    source.delete(meta.id)
  })
}

export async function createDurableSessionProjectRepository({
  workspaceId,
  database,
  sessionRepository,
}: {
  workspaceId: string
  database: ProjectDatabase
  sessionRepository: ProjectRepository
}): Promise<DurableSessionProjectRepository> {
  const fromDatabase = await database.loadAll(workspaceId)
  const fromSession = sessionRepository
    .list()
    .map((meta) => sessionRepository.load(meta.id))
    .filter((project): project is Project => project !== null)
  const projects = newestById([...fromDatabase, ...fromSession])
  await Promise.all(projects.map((project) => database.put(workspaceId, project)))
  return new DurableSessionProjectRepository(workspaceId, database, projects, sessionRepository)
}
