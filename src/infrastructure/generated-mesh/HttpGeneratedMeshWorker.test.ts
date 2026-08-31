import { describe, expect, it, vi } from 'vitest'
import type { GeneratedMeshWorkerRequest } from '../../application/generatedMeshLifecycle'
import { HttpGeneratedMeshWorker } from './HttpGeneratedMeshWorker'

const hash = 'a'.repeat(64)
const sourceHash = 'b'.repeat(64)
const reviewHash = 'bd7c250566c6e99f47c174b589b7551f8b0e930ed056511d1e8f653bc71d3c4a'
const request: GeneratedMeshWorkerRequest = {
  jobId: 'job-1',
  productId: 'product-1',
  productFingerprint: 'product-mesh-v1|fixture',
  targetDims: { w: 1000, d: 600, h: 500 },
  source: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', sha256: sourceHash },
}

const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

describe('오프라인 HTTP 생성 메시 worker adapter', () => {
  it('검증된 이미지 bytes와 최소 메타데이터만 multipart로 보내고 GLB를 중립 결과로 매핑한다', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response({
        glbBase64: btoa(String.fromCharCode(4, 5, 6)),
        contentSha256: hash,
        sourceImageSha256: sourceHash,
        generatedAt: '2026-08-28T00:00:00.000Z',
        generator: { name: 'TripoSR', version: '2024.03', modelDigest: 'c'.repeat(64) },
        silhouetteIou: 0.81,
        reviewViews: [
          {
            name: 'view-000.png',
            pngBase64: btoa(String.fromCharCode(7, 8)),
            sha256: reviewHash,
          },
        ],
      })
    )
    const worker = new HttpGeneratedMeshWorker(
      'http://127.0.0.1:8980/',
      fetcher as unknown as typeof fetch
    )

    await expect(worker.generate(request)).resolves.toMatchObject({
      glb: new Uint8Array([4, 5, 6]),
      contentSha256: hash,
      sourceImageSha256: sourceHash,
      generator: { name: 'TripoSR', version: '2024.03' },
      reviewViews: [{ name: 'view-000.png', png: new Uint8Array([7, 8]), sha256: reviewHash }],
    })
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8980/generate',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
    )
    const body = fetcher.mock.calls[0][1]!.body as FormData
    expect(JSON.parse(String(body.get('metadata')))).toEqual({
      jobId: 'job-1',
      productId: 'product-1',
      productFingerprint: 'product-mesh-v1|fixture',
      targetDims: { w: 1000, d: 600, h: 500 },
      sourceImageSha256: sourceHash,
    })
  })

  it('HTTP 실패와 비정상 응답을 의미 오류로 변환한다', async () => {
    const unavailable = new HttpGeneratedMeshWorker(
      'http://127.0.0.1:8980',
      vi.fn(async () => response({}, 503)) as unknown as typeof fetch
    )
    await expect(unavailable.generate(request)).rejects.toMatchObject({ kind: 'unavailable' })

    const invalid = new HttpGeneratedMeshWorker(
      'http://127.0.0.1:8980',
      vi.fn(async () => response({ glbBase64: 'x' })) as unknown as typeof fetch
    )
    await expect(invalid.generate(request)).rejects.toMatchObject({ kind: 'invalid-response' })
  })
})
