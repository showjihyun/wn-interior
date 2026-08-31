import type { AiSettings } from './aiSettings'
import { normalizeAiPlan } from './normalizeFloorPlan'
import type {
  AiVisionGateway,
  AnalysisProgress,
  Delay,
  FloorPlanAnalysis,
  ServiceFailureKind,
} from './ports'
import { ExternalServiceError } from './ports'

const RETRY_DELAYS_MS = [0, 6_000, 18_000]

export class FloorPlanAnalysisError extends Error {
  constructor(
    public readonly code: ServiceFailureKind | 'invalid-floor-plan',
    public readonly raw?: string
  ) {
    super(code)
    this.name = 'FloorPlanAnalysisError'
  }
}

export interface AnalyzeFloorPlan {
  execute(
    settings: AiSettings,
    imageDataUrl: string,
    onProgress?: (progress: AnalysisProgress) => void
  ): Promise<FloorPlanAnalysis>
}

export function createAnalyzeFloorPlan(gateway: AiVisionGateway, delay: Delay): AnalyzeFloorPlan {
  return {
    async execute(settings, imageDataUrl, onProgress) {
      let lastError: unknown
      for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
        const retryAfterMs = RETRY_DELAYS_MS[attempt]
        if (retryAfterMs > 0) {
          onProgress?.({ attempt, maxRetries: RETRY_DELAYS_MS.length - 1, retryAfterMs })
          await delay.wait(retryAfterMs)
        }

        try {
          const raw = await gateway.request(settings, imageDataUrl)
          let parsed: unknown
          try {
            parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
          } catch {
            throw new FloorPlanAnalysisError('invalid-response', raw)
          }
          const normalized = normalizeAiPlan(parsed)
          if (!normalized.ok || !normalized.plan) {
            throw new FloorPlanAnalysisError('invalid-floor-plan', raw)
          }
          return { plan: normalized.plan, raw }
        } catch (error) {
          lastError = error
          if (error instanceof ExternalServiceError && error.kind !== 'rate-limited') {
            throw new FloorPlanAnalysisError(error.kind)
          }
          if (!(error instanceof ExternalServiceError)) throw error
        }
      }

      if (lastError instanceof ExternalServiceError) {
        throw new FloorPlanAnalysisError(lastError.kind)
      }
      throw new FloorPlanAnalysisError('unavailable')
    },
  }
}
