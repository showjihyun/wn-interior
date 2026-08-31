import { describe, expect, it, vi } from 'vitest'
import type { Gray } from '../../domain/engine/planVision'
import type { MaskDecoder } from './BrowserMaskDecoder'
import { HttpPlanVisionGateway } from './HttpPlanVisionGateway'

const gray: Gray = { data: new Uint8Array([255]), width: 1, height: 1 }
const decoder: MaskDecoder = { decode: async () => gray }
const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

describe('HttpPlanVisionGateway', () => {
  it('외부 mask DTO를 중립 Gray 결과로 디코딩한다', async () => {
    const fetchFn = vi.fn(async () =>
      response({
        maskDataUrl: 'wall',
        doorMaskDataUrl: 'door',
        windowMaskDataUrl: 'window',
        device: 'cpu',
        inferenceMs: 12,
      })
    )
    const gateway = new HttpPlanVisionGateway(
      'cv',
      'rooms',
      decoder,
      fetchFn as unknown as typeof fetch
    )

    await expect(gateway.segment('image')).resolves.toMatchObject({
      walls: gray,
      openings: { door: gray, window: gray },
      engineLabel: 'cpu',
      durationMs: 12,
    })
  })

  it('잘못된 방 응답은 invalid-response로 차단한다', async () => {
    const fetchFn = vi.fn(async () => response({ rooms: [] }))
    const gateway = new HttpPlanVisionGateway(
      'cv',
      'rooms',
      decoder,
      fetchFn as unknown as typeof fetch
    )

    await expect(gateway.rooms('image')).rejects.toMatchObject({ kind: 'invalid-response' })
  })
})
