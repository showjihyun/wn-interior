import { describe, expect, it } from 'vitest'
import type { AiVisionGateway, Delay } from './ports'
import { ExternalServiceError } from './ports'
import { createAnalyzeFloorPlan, FloorPlanAnalysisError } from './analyzeFloorPlan'

const settings = { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'vision' }
const validResponse = JSON.stringify({
  wallHeight: 2400,
  walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 120 }],
  openings: [],
  rooms: [],
})

describe('AnalyzeFloorPlan', () => {
  it('게이트웨이 응답을 검증된 mm 도메인 모델로 변환한다', async () => {
    const gateway: AiVisionGateway = { request: async () => validResponse }
    const delay: Delay = { wait: async () => undefined }

    const result = await createAnalyzeFloorPlan(gateway, delay).execute(
      settings,
      'data:image/png,x'
    )

    expect(result.plan.unit).toBe('mm')
    expect(result.plan.walls).toHaveLength(1)
    expect(result.raw).toBe(validResponse)
  })

  it('429는 정해진 지연 뒤 재시도하고 성공 결과를 반환한다', async () => {
    let attempts = 0
    const waits: number[] = []
    const gateway: AiVisionGateway = {
      request: async () => {
        attempts += 1
        if (attempts < 3) throw new ExternalServiceError('rate-limited')
        return validResponse
      },
    }
    const delay: Delay = { wait: async (milliseconds) => void waits.push(milliseconds) }

    const result = await createAnalyzeFloorPlan(gateway, delay).execute(
      settings,
      'data:image/png,x'
    )

    expect(result.plan.walls).toHaveLength(1)
    expect(attempts).toBe(3)
    expect(waits).toEqual([6_000, 18_000])
  })

  it('파싱할 수 없는 응답은 원문을 포함한 경계 오류로 반환한다', async () => {
    const gateway: AiVisionGateway = { request: async () => 'not-json' }
    const delay: Delay = { wait: async () => undefined }

    await expect(
      createAnalyzeFloorPlan(gateway, delay).execute(settings, 'data:image/png,x')
    ).rejects.toMatchObject({
      name: 'FloorPlanAnalysisError',
      raw: 'not-json',
    } satisfies Partial<FloorPlanAnalysisError>)
  })

  it('인증 실패를 사용자에게 조치 가능한 애플리케이션 오류로 매핑한다', async () => {
    const gateway: AiVisionGateway = {
      request: async () => {
        throw new ExternalServiceError('unauthorized')
      },
    }
    const delay: Delay = { wait: async () => undefined }

    await expect(
      createAnalyzeFloorPlan(gateway, delay).execute(settings, 'data:image/png,x')
    ).rejects.toMatchObject({ code: 'unauthorized' })
  })
})
