import { describe, expect, it, vi } from 'vitest'
import type { AiSettings } from '../../application/aiSettings'
import { ExternalServiceError } from '../../application/ports'
import { OpenAiCompatibleVisionGateway } from './OpenAiCompatibleVisionGateway'

const settings: AiSettings = { baseUrl: 'https://ai.test/v1', apiKey: 'key', model: 'model' }
const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

describe('OpenAiCompatibleVisionGateway', () => {
  it('OpenAI 호환 응답 content를 반환한다', async () => {
    const fetchFn = vi.fn(async () =>
      response({ choices: [{ message: { content: '{"walls":[]}' } }] })
    )
    const gateway = new OpenAiCompatibleVisionGateway(fetchFn as unknown as typeof fetch)

    await expect(gateway.request(settings, 'data:image/png,x')).resolves.toBe('{"walls":[]}')
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('HTTP 상태를 의미 기반 오류로 변환한다', async () => {
    const fetchFn = vi.fn(async () => response({}, 429))
    const gateway = new OpenAiCompatibleVisionGateway(fetchFn as unknown as typeof fetch)

    await expect(gateway.request(settings, 'data:image/png,x')).rejects.toMatchObject({
      name: 'ExternalServiceError',
      kind: 'rate-limited',
    } satisfies Partial<ExternalServiceError>)
  })

  it('비정상 JSON 구조를 invalid-response로 변환한다', async () => {
    const fetchFn = vi.fn(async () => response({ unexpected: true }))
    const gateway = new OpenAiCompatibleVisionGateway(fetchFn as unknown as typeof fetch)

    await expect(gateway.request(settings, 'data:image/png,x')).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })
})
