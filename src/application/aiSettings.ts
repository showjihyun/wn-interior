export interface AiSettings {
  baseUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_AI_MODEL = 'google/gemma-4-26b-a4b-it:free'
const RETIRED_AI_MODELS = new Set(['stealth/ox-alpha'])

export const DEFAULT_AI_SETTINGS: AiSettings = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: DEFAULT_AI_MODEL,
}

export function resolveAiModel(model: string): string {
  const normalized = model.trim()
  return !normalized || RETIRED_AI_MODELS.has(normalized.toLowerCase())
    ? DEFAULT_AI_MODEL
    : normalized
}
