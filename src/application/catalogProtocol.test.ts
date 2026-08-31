import { describe, expect, it } from 'vitest'
import { importCatalogProtocol, InvalidCatalogProtocolError } from './catalogProtocol'
import ikeaKitchenFeed from '../../schemas/examples/ikea-kitchen-chain.catalog.json'

const livartFeed = {
  protocol: 'homeplan.catalog',
  version: '1.0',
  catalog: {
    id: 'hyundai-livart-ko',
    provider: 'Hyundai Livart',
    locale: 'ko-KR',
    generatedAt: '2026-08-31T00:00:00.000Z',
  },
  products: [
    {
      externalId: 'P200089504',
      name: '리르 3시트 w3000 가죽 소파',
      brand: '리바트',
      sku: 'P200089504',
      classification: { category: 'seating.sofa', tags: ['4인용', '가죽'] },
      dimensions: { width: 300, depth: 95, height: 87, unit: 'cm' },
      price: {
        amount: 2_237_000,
        currency: 'KRW',
        checkedAt: '2026-08-31',
        basis: '리르 3시트 본체 1개',
      },
      source: {
        url: 'https://www.hyundailivart.co.kr/p/P200089504',
        retrievedAt: '2026-08-31T00:00:00.000Z',
      },
      materials: ['천연 황소 가죽', 'PVC', '알루미늄'],
      render: { shapeHint: 'sofa3', colorways: ['#8b7568'] },
      variants: [
        {
          id: 'compact-2600',
          label: '2600 컴팩트형',
          sku: 'P200089505',
          dimensions: { width: 260, depth: 95, height: 87, unit: 'cm' },
          price: {
            amount: 1_926_000,
            currency: 'KRW',
            checkedAt: '2026-08-31',
            basis: '컴팩트 본체 1개',
          },
        },
      ],
      installation: { mount: 'floor', provides: ['seating.sofa'] },
    },
  ],
}

describe('HomePlan Catalog Protocol 1.0 Import', () => {
  it('국내 상품 feed의 cm·KRW·출처를 mm Product로 정규화한다', () => {
    const result = importCatalogProtocol(livartFeed)

    expect(result.catalogId).toBe('hyundai-livart-ko')
    expect(result.products).toHaveLength(1)
    expect(result.products[0]).toMatchObject({
      id: 'catalog:hyundai-livart-ko:P200089504',
      name: '리르 3시트 w3000 가죽 소파',
      brand: '리바트',
      category: 'living',
      dims: { w: 3000, d: 950, h: 870 },
      price: 2_237_000,
      shape: 'sofa3',
      catalog: {
        protocolVersion: '1.0',
        catalogId: 'hyundai-livart-ko',
        externalId: 'P200089504',
        provider: 'Hyundai Livart',
        sourceUrl: 'https://www.hyundailivart.co.kr/p/P200089504',
        sku: 'P200089504',
        materials: ['천연 황소 가죽', 'PVC', '알루미늄'],
      },
      installation: { provides: ['seating.sofa'] },
      dimensionVariants: [
        {
          id: 'compact-2600',
          label: '2600 컴팩트형',
          dims: { w: 2600, d: 950, h: 870 },
        },
      ],
    })
    expect(result.products[0].catalog?.variants[0]).toMatchObject({
      id: 'compact-2600',
      sku: 'P200089505',
      dims: { w: 2600, d: 950, h: 870 },
      price: 1_926_000,
    })
    expect(result.issues).toEqual([])
  })

  it('치수가 누락된 상품을 경로별 오류로 보고하고 문서 전체를 거절한다', () => {
    const invalid = structuredClone(livartFeed) as any
    delete invalid.products[0].dimensions.depth

    expect(() => importCatalogProtocol(invalid)).toThrow(InvalidCatalogProtocolError)
    try {
      importCatalogProtocol(invalid)
    } catch (error) {
      expect((error as InvalidCatalogProtocolError).issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          code: 'dimension-invalid',
          path: '$.products[0].dimensions.depth',
        })
      )
    }
  })

  it('같은 catalog의 중복 externalId를 조용히 덮어쓰지 않는다', () => {
    const duplicate = structuredClone(livartFeed)
    duplicate.products.push(structuredClone(duplicate.products[0]))

    expect(() => importCatalogProtocol(duplicate)).toThrow(InvalidCatalogProtocolError)
    try {
      importCatalogProtocol(duplicate)
    } catch (error) {
      expect((error as InvalidCatalogProtocolError).issues).toContainEqual(
        expect.objectContaining({ code: 'duplicate-external-id', path: '$.products[1].externalId' })
      )
    }
  })

  it('IKEA 주방 chain의 surface·allOf capability를 Product 계약으로 보존한다', () => {
    const result = importCatalogProtocol(ikeaKitchenFeed)
    const faucet = result.products.find((product) => product.shape === 'faucet')!
    const sink = result.products.find((product) => product.shape === 'kitchenSink')!

    expect(sink).toMatchObject({
      mount: 'surface',
      installation: {
        provides: ['kitchen.sink'],
        requires: { allOf: ['kitchen.base-cabinet'], scope: 'support-chain' },
        surface: { supportedBy: ['kitchen.base-cabinet'], anchor: 'center' },
      },
    })
    expect(faucet.installation?.requires?.allOf).toEqual(['kitchen.base-cabinet', 'kitchen.sink'])
  })

  it('선택 필드 생략은 안전 폴백 warning으로 남기고 JSON 구문 오류는 거절한다', () => {
    const fallback = structuredClone(livartFeed) as any
    delete fallback.products[0].render
    delete fallback.products[0].price
    fallback.products[0].assets = [{ kind: 'image', url: 'https://example.com/product.jpg' }]
    fallback.products[0].installation.requires = {
      anyOf: ['wall.anchor', 'floor.anchor'],
      scope: 'project',
    }

    const result = importCatalogProtocol(fallback)
    expect(result.products[0]).toMatchObject({ shape: 'box', price: undefined })
    expect(result.products[0].catalog?.sourceImageUrls).toEqual(['https://example.com/product.jpg'])
    expect(result.products[0].installation?.requires).toMatchObject({
      anyOf: ['wall.anchor', 'floor.anchor'],
      scope: 'project',
    })
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'shape-fallback' })
    )
    expect(() => importCatalogProtocol('{not-json')).toThrow(InvalidCatalogProtocolError)
    expect(() => importCatalogProtocol(null)).toThrow(InvalidCatalogProtocolError)
  })
})
