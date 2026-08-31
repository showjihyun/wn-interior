import type { AiSettings } from '../../application/aiSettings'
import type { AiSettingsRepository } from '../../application/ports'
import type { KeyValueStorage } from './LocalStorageProjectRepository'

const AI_SETTINGS_KEY = 'hp3d.ai'

export class LocalStorageAiSettingsRepository implements AiSettingsRepository {
  constructor(private readonly storage: KeyValueStorage = localStorage) {}

  load(): AiSettings | null {
    try {
      const raw = this.storage.getItem(AI_SETTINGS_KEY)
      if (!raw) return null
      const settings = JSON.parse(raw) as AiSettings
      return settings &&
        typeof settings.baseUrl === 'string' &&
        typeof settings.apiKey === 'string' &&
        typeof settings.model === 'string'
        ? settings
        : null
    } catch {
      return null
    }
  }

  save(settings: AiSettings): void {
    this.storage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings))
  }
}
