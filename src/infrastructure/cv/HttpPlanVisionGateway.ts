import type {
  PlanVisionGateway,
  RoomPredictionResult,
  SemanticFloorPlanMasks,
  ServiceFailureKind,
} from '../../application/ports'
import { ExternalServiceError } from '../../application/ports'
import type { MaskDecoder } from './BrowserMaskDecoder'

interface SegmentationDto {
  maskDataUrl?: string
  doorMaskDataUrl?: string
  windowMaskDataUrl?: string
  device?: string
  inferenceMs?: number
  error?: string
}

interface RoomsDto {
  rooms?: Array<{ name?: string; polygon: Array<{ x: number; y: number }> }>
  sourceWidth?: number
  sourceHeight?: number
  device?: string
  inferenceMs?: number
  safe?: boolean
  diagnostics?: Record<string, unknown>
  error?: string
}

type FetchLike = typeof fetch

export class HttpPlanVisionGateway implements PlanVisionGateway {
  constructor(
    private readonly cvServerUrl: string,
    private readonly raster2SeqServerUrl: string,
    private readonly maskDecoder: MaskDecoder,
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = 60_000
  ) {}

  async segment(imageDataUrl: string): Promise<SemanticFloorPlanMasks> {
    await this.requestJson(`${this.cvServerUrl}/health`, { method: 'GET' }, 1_500)
    const result = await this.postJson<SegmentationDto>(`${this.cvServerUrl}/segment`, {
      imageDataUrl,
    })
    if (!result.maskDataUrl || !result.doorMaskDataUrl || !result.windowMaskDataUrl) {
      throw new ExternalServiceError('invalid-response')
    }
    const [walls, door, window] = await Promise.all([
      this.maskDecoder.decode(result.maskDataUrl),
      this.maskDecoder.decode(result.doorMaskDataUrl),
      this.maskDecoder.decode(result.windowMaskDataUrl),
    ])
    return {
      walls,
      openings: { door, window },
      engineLabel: result.device ?? 'unknown',
      durationMs: result.inferenceMs ?? 0,
    }
  }

  async rooms(imageDataUrl: string): Promise<RoomPredictionResult> {
    await this.requestJson(`${this.raster2SeqServerUrl}/health`, { method: 'GET' }, 1_500)
    const result = await this.postJson<RoomsDto>(`${this.raster2SeqServerUrl}/rooms`, {
      imageDataUrl,
    })
    if (
      !Array.isArray(result.rooms) ||
      typeof result.sourceWidth !== 'number' ||
      typeof result.sourceHeight !== 'number' ||
      typeof result.safe !== 'boolean'
    ) {
      throw new ExternalServiceError('invalid-response')
    }
    return {
      rooms: result.rooms,
      sourceWidth: result.sourceWidth,
      sourceHeight: result.sourceHeight,
      safe: result.safe,
      diagnostics: result.diagnostics,
      engineLabel: result.device ?? 'unknown',
      durationMs: result.inferenceMs ?? 0,
    }
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    return this.requestJson<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit,
    timeoutMs = this.timeoutMs
  ): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await this.fetchFn(url, { ...init, signal: controller.signal })
      if (!response.ok) throw new ExternalServiceError(this.failureKind(response.status))
      try {
        const result = (await response.json()) as T & { error?: string }
        if (result?.error) throw new ExternalServiceError('invalid-response')
        return result
      } catch (error) {
        if (error instanceof ExternalServiceError) throw error
        throw new ExternalServiceError('invalid-response')
      }
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error
      throw new ExternalServiceError('unavailable', error)
    } finally {
      clearTimeout(timeout)
    }
  }

  private failureKind(status: number): ServiceFailureKind {
    return status === 401
      ? 'unauthorized'
      : status === 402
        ? 'quota-exhausted'
        : status === 429
          ? 'rate-limited'
          : 'unavailable'
  }
}
