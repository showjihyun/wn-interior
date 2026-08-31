import type { AiSettings } from '../../application/aiSettings'
import type { AiVisionGateway } from '../../application/ports'
import { ExternalServiceError } from '../../application/ports'
import { buildChatRequest, parseChatResponse } from './OpenAiProtocol'

export class OpenAiCompatibleVisionGateway implements AiVisionGateway {
  constructor(
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private readonly timeoutMs = 60_000
  ) {}

  async request(settings: AiSettings, imageDataUrl: string): Promise<string> {
    const request = buildChatRequest(settings, imageDataUrl)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchFn(request.url, {
        ...request.init,
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new ExternalServiceError(
          response.status === 401
            ? 'unauthorized'
            : response.status === 402
              ? 'quota-exhausted'
              : response.status === 429
                ? 'rate-limited'
                : 'unavailable'
        )
      }
      try {
        return parseChatResponse(await response.json())
      } catch (error) {
        if (error instanceof ExternalServiceError) throw error
        throw new ExternalServiceError('invalid-response')
      }
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error
      throw new ExternalServiceError('unavailable')
    } finally {
      clearTimeout(timeout)
    }
  }
}
