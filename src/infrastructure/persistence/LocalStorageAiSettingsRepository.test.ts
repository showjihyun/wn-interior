import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageAiSettingsRepository } from './LocalStorageAiSettingsRepository'

describe('LocalStorageAiSettingsRepository', () => {
  beforeEach(() => localStorage.clear())

  it('완전한 설정만 저장하고 복원한다', () => {
    const repository = new LocalStorageAiSettingsRepository()
    const settings = { baseUrl: 'https://ai.test/v1', apiKey: 'key', model: 'vision' }

    repository.save(settings)

    expect(repository.load()).toEqual(settings)
  })

  it('필수 필드가 빠진 저장 문서는 거부한다', () => {
    localStorage.setItem('hp3d.ai', JSON.stringify({ baseUrl: 'https://ai.test/v1' }))

    expect(new LocalStorageAiSettingsRepository().load()).toBeNull()
  })
})
