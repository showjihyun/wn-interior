import type { Project } from '../../domain/model'
import type { LegacyProjectSource } from '../../application/ports'
import { decodeProjectDocument, type KeyValueStorage } from './LocalStorageProjectRepository'

const LEGACY_PROJECT_KEY = 'homeplan3d.project.v1'

export class LocalStorageLegacyProjectSource implements LegacyProjectSource {
  constructor(private readonly storage: KeyValueStorage = localStorage) {}

  load(): Project | null {
    try {
      const raw = this.storage.getItem(LEGACY_PROJECT_KEY)
      if (!raw) return null
      return decodeProjectDocument(JSON.parse(raw), false)
    } catch {
      return null
    }
  }

  remove(): void {
    this.storage.removeItem(LEGACY_PROJECT_KEY)
  }
}
