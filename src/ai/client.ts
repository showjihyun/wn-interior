// ─────────────────────────────────────────────────────────────
// AI 채팅 클라이언트 — OpenRouter 등 OpenAI 호환 API 어댑터 (순수함수)
// ─────────────────────────────────────────────────────────────
import type { AiSettings } from '../types'

export const FLOOR_PLAN_PROMPT = `너는 건축 평면도 이미지 해석 전문가다. 이미지의 아파트 평면도를 분석하여 다음 JSON만 출력하라 (설명 금지, 코드펜스 금지).
규칙:
- 단위는 전부 mm. 원점은 도면 좌상단, x=우측+, y=하단+.
- 도면에 적힌 치수 숫자를 최우선 사용. 치수가 없으면 문 폭 900mm 등 일반 규격으로 비율 추정.
- walls: 각 벽을 선분 {id:"w1"...,"a":{x,y},"b":{x,y},"thickness} 로. 외벽 200, 내벽 120 권장.
- openings: 문/창문. {wallId, type:"door"|"window"|"entry", offset(벽 시작점부터 거리), width, height, sill}. door height 2000~2100 sill 0 / window sill 900~1000.
- rooms: 방 이름(한글: 안방,방1,방2,주방,거실,욕실,현관 등)과 polygon(꼭짓점 배열, 닫힌 영역).
출력 형식:
{"wallHeight":2400,"walls":[...],"openings":[...],"rooms":[{"name":"...","polygon":[{x,y},...]},...]}`

export interface ChatRequest {
  url: string
  init: {
    method: 'POST'
    headers: Record<string, string>
    body: string
  }
}

/** OpenAI 호환 chat/completions 요청 생성 (Vision: 텍스트 프롬프트 + 이미지 1장) */
export function buildChatRequest(settings: AiSettings, imageDataUrl: string): ChatRequest {
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`
  return {
    url,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: FLOOR_PLAN_PROMPT },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    },
  }
}

/** 응답에서 content 추출 + 코드펜스 제거. 비정상 응답은 throw */
export function parseChatResponse(json: unknown): string {
  const j = json as { choices?: { message?: { content?: string } }[] }
  const content = j?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('응답에 content가 없습니다')
  }
  return content.replace(/```json|```/g, '').trim()
}
