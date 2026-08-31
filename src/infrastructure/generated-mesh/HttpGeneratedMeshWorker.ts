import type {
  GeneratedMeshWorker,
  GeneratedMeshWorkerOutput,
  GeneratedMeshWorkerRequest,
} from '../../application/generatedMeshLifecycle'
import { ExternalServiceError } from '../../application/ports'

interface WorkerResponse {
  glbBase64?: string
  contentSha256?: string
  sourceImageSha256?: string
  generatedAt?: string
  generator?: { name?: string; version?: string; modelDigest?: string }
  silhouetteIou?: number
  reviewViews?: Array<{ name?: string; pngBase64?: string; sha256?: string }>
}

export class HttpGeneratedMeshWorker implements GeneratedMeshWorker {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 120_000
  ) {
    const url = new URL(baseUrl)
    if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
      throw new Error('generated-mesh-worker-must-be-local')
    }
  }

  async generate(request: GeneratedMeshWorkerRequest): Promise<GeneratedMeshWorkerOutput> {
    const form = new FormData()
    form.set(
      'metadata',
      JSON.stringify({
        jobId: request.jobId,
        productId: request.productId,
        productFingerprint: request.productFingerprint,
        targetDims: request.targetDims,
        sourceImageSha256: request.source.sha256,
      })
    )
    form.set(
      'image',
      new Blob([request.source.bytes.slice().buffer as ArrayBuffer], {
        type: request.source.mimeType,
      }),
      `source.${extensionFor(request.source.mimeType)}`
    )
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl.replace(/\/+$/, '')}/generate`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      })
    } catch (error) {
      throw new ExternalServiceError('unavailable', error)
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) {
      const kind =
        response.status === 401 || response.status === 403
          ? 'unauthorized'
          : response.status === 429
            ? 'rate-limited'
            : 'unavailable'
      throw new ExternalServiceError(kind)
    }

    let body: WorkerResponse
    try {
      body = (await response.json()) as WorkerResponse
    } catch (error) {
      throw new ExternalServiceError('invalid-response', error)
    }
    if (!isValidResponse(body, request.source.sha256)) {
      throw new ExternalServiceError('invalid-response')
    }
    let glb: Uint8Array
    try {
      if (body.glbBase64.length > 120_000_000) throw new Error('worker-output-too-large')
      const decoded = atob(body.glbBase64)
      glb = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
    } catch (error) {
      throw new ExternalServiceError('invalid-response', error)
    }
    if (glb.byteLength === 0) throw new ExternalServiceError('invalid-response')
    let reviewViews
    try {
      reviewViews = body.reviewViews.map((view) => ({
        name: view.name!,
        png: decodeBase64(view.pngBase64!),
        sha256: view.sha256!,
      }))
    } catch (error) {
      throw new ExternalServiceError('invalid-response', error)
    }
    return {
      glb,
      contentSha256: body.contentSha256,
      sourceImageSha256: body.sourceImageSha256,
      generatedAt: body.generatedAt,
      generator: {
        name: body.generator.name,
        version: body.generator.version,
        modelDigest: body.generator.modelDigest,
      },
      silhouetteIou: body.silhouetteIou,
      reviewViews,
    }
  }
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

function isValidResponse(
  body: WorkerResponse,
  expectedSourceSha256: string
): body is Required<WorkerResponse> & {
  generator: { name: string; version: string; modelDigest: string }
  reviewViews: Array<{ name: string; pngBase64: string; sha256: string }>
} {
  return Boolean(
    body.glbBase64 &&
    /^[a-f0-9]{64}$/.test(body.contentSha256 ?? '') &&
    body.sourceImageSha256 === expectedSourceSha256 &&
    /^\d{4}-\d{2}-\d{2}T/.test(body.generatedAt ?? '') &&
    body.generator?.name &&
    body.generator.version &&
    /^[a-f0-9]{64}$/.test(body.generator.modelDigest ?? '') &&
    Number.isFinite(body.silhouetteIou) &&
    body.silhouetteIou! >= 0 &&
    body.silhouetteIou! <= 1 &&
    Array.isArray(body.reviewViews) &&
    body.reviewViews.length > 0 &&
    body.reviewViews.every(
      (view) =>
        /^[a-zA-Z0-9_-]+\.png$/.test(view.name ?? '') &&
        Boolean(view.pngBase64) &&
        /^[a-f0-9]{64}$/.test(view.sha256 ?? '')
    )
  )
}

function decodeBase64(encoded: string): Uint8Array {
  if (encoded.length > 40_000_000) throw new Error('worker-review-view-too-large')
  const decoded = atob(encoded)
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  if (bytes.byteLength === 0) throw new Error('worker-review-view-empty')
  return bytes
}
