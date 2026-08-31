import { describe, expect, it } from 'vitest'
import { StaticProductCatalog } from './StaticReferenceData'

const REQUIRED_IDS = [
  'ik-kivik-3seat',
  'ik-tillreda-induction-2zone',
  'ik-aelmaren-kitchen-faucet',
  'ik-kilsviken-sink-72',
  'ik-metod-sinarp-sink-cabinet',
  'ik-majgull-curtain-pair',
  'ik-fado-lamp',
  'ik-malm-queen',
  'ik-lack-coffee',
  'ik-billy-bookcase',
  'ik-norden-table',
  'ik-pax-wardrobe-200',
]

describe('IKEA Korea 실상품 계약', () => {
  const products = new StaticProductCatalog().list()

  it('선정한 이미지 기반 실상품을 모두 제공한다', () => {
    expect(REQUIRED_IDS.every((id) => products.some((product) => product.id === id))).toBe(true)
  })

  it('모든 실상품에 가격 기준·공식 출처·검증된 이미지 스냅샷을 보존한다', () => {
    const retailProducts = REQUIRED_IDS.map((id) =>
      products.find((product) => product.id === id)
    ) as unknown as Array<Record<string, unknown> | undefined>

    for (const product of retailProducts) {
      expect(product).toBeDefined()
      expect(product).toMatchObject({
        brand: 'IKEA',
        retail: {
          retailer: 'IKEA Korea',
          currency: 'KRW',
          checkedAt: expect.stringMatching(/^2026-08-(28|31)$/),
        },
        appearance: {
          textureUrl: expect.stringMatching(/^\/catalog\/ikea\/.+\.jpg$/),
          imageSourceUrl: expect.stringMatching(/^https:\/\/www\.ikea\.com\//),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      })
    }
  })
})
