import type { KeyValueStorage } from './LocalStorageProjectRepository'

const WORKSPACE_PARAM = 'workspace'
const WORKSPACE_STORAGE_KEY = 'hp3d.workspace'
const VALID_WORKSPACE_ID = /^[A-Za-z0-9_-]{1,80}$/

export interface BrowserLocationLike {
  href: string
}

export interface BrowserHistoryLike {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void
}

export interface ResolveBrowserWorkspaceDependencies {
  location: BrowserLocationLike
  history: BrowserHistoryLike
  storage: KeyValueStorage
  nextId: () => string
}

export function resolveBrowserWorkspaceId({
  location,
  history,
  storage,
  nextId,
}: ResolveBrowserWorkspaceDependencies): string {
  const url = new URL(location.href)
  const fromUrl = url.searchParams.get(WORKSPACE_PARAM)
  const stored = storage.getItem(WORKSPACE_STORAGE_KEY)
  const workspaceId =
    (fromUrl && VALID_WORKSPACE_ID.test(fromUrl) ? fromUrl : null) ??
    (stored && VALID_WORKSPACE_ID.test(stored) ? stored : null) ??
    nextId()
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 80)

  storage.setItem(WORKSPACE_STORAGE_KEY, workspaceId)
  if (fromUrl !== workspaceId) {
    url.searchParams.set(WORKSPACE_PARAM, workspaceId)
    history.replaceState(null, '', url)
  }
  return workspaceId
}
