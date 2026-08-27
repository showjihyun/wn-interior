// 계약 테스트 — OpenRouter(OpenAI 호환) 요청 빌더와 응답 파서
import { describe, it, expect } from 'vitest'
import { buildChatRequest, DEFAULT_AI_MODEL, parseChatResponse, resolveAiModel } from './client'
import type { AiSettings } from '../types'

const settings: AiSettings = {
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or-v1-test',
  model: 'openai/gpt-4o',
}

describe('buildChatRequest', () => {
  it('OpenAI 호환 엔드포인트 URL과 헤더를 만든다', () => {
    const req = buildChatRequest(settings, 'data:image/png;base64,AAA')
    expect(req.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(req.init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-or-v1-test',
    })
  })

  it('본문에 model + vision 메시지(텍스트 프롬프트 + image_url)를 담는다', () => {
    const req = buildChatRequest(settings, 'data:image/png;base64,AAA')
    const body = JSON.parse(req.init.body as string)
    expect(body.model).toBe('openai/gpt-4o')
    expect(body.messages[0].role).toBe('user')
    expect(body.messages[0].content[0].type).toBe('text')
    expect(body.messages[0].content[0].text).toContain('JSON')
    expect(body.messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,AAA' },
    })
  })

  it('baseUrl 끝 슬래시를 정규화한다', () => {
    const req = buildChatRequest(
      { ...settings, baseUrl: 'https://openrouter.ai/api/v1/' },
      'data:image/png;base64,A'
    )
    expect(req.url).not.toContain('//chat')
  })

  it('빈 모델과 폐기된 모델은 현재 기본 vision 모델로 대체한다', () => {
    expect(resolveAiModel('')).toBe(DEFAULT_AI_MODEL)
    expect(resolveAiModel('stealth/ox-alpha')).toBe(DEFAULT_AI_MODEL)

    const req = buildChatRequest(
      { ...settings, model: 'stealth/ox-alpha' },
      'data:image/png;base64,A'
    )
    expect(JSON.parse(req.init.body).model).toBe(DEFAULT_AI_MODEL)
  })
})

describe('parseChatResponse', () => {
  it('OpenAI 형식 응답에서 content를 추출한다', () => {
    const j = { choices: [{ message: { content: '{"walls":[]}' } }] }
    expect(parseChatResponse(j)).toBe('{"walls":[]}')
  })

  it('코드펜스를 제거한다', () => {
    const j = { choices: [{ message: { content: '```json\n{"walls":[]}\n```' } }] }
    expect(parseChatResponse(j)).toBe('{"walls":[]}')
  })

  it('응답 형식이 비정상이면 에러를 던진다', () => {
    expect(() => parseChatResponse({})).toThrow()
    expect(() => parseChatResponse({ choices: [] })).toThrow()
  })
})
