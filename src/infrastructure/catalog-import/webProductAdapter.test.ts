import { describe, expect, it } from 'vitest'
import { importCatalogProtocol } from '../../application/catalogProtocol'
import {
  adaptWebProductSource,
  InvalidWebProductSourceError,
  type WebProductAdapterInput,
} from './webProductAdapter'

const catalog = {
  id: 'schemaorg-example',
  provider: 'Example Furniture',
  locale: 'ko-KR' as const,
  generatedAt: '2026-08-31T00:00:00.000Z',
}

const baseOverrides = {
  classification: { category: 'seating.sofa', tags: ['4인용'] },
  installation: { mount: 'floor', provides: ['seating.sofa'] },
  render: { shapeHint: 'sofa3' },
  priceBasis: '소파 본체 1개',
  checkedAt: '2026-08-31',
}

describe('web product source adapter', () => {
  it('schema.org Product·Offer·QuantitativeValue를 protocol feed로 변환한다', () => {
    const source = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: '구조화 소파',
      sku: 'SOFA-3000',
      brand: { '@type': 'Brand', name: '예제가구' },
      image: ['https://cdn.example.com/sofa.jpg'],
      width: { '@type': 'QuantitativeValue', value: 300, unitCode: 'CMT' },
      depth: { '@type': 'QuantitativeValue', value: 95, unitText: 'cm' },
      height: { '@type': 'QuantitativeValue', value: 87, unitCode: 'CMT' },
      material: ['천연가죽', '알루미늄'],
      offers: {
        '@type': 'Offer',
        price: '2237000',
        priceCurrency: 'KRW',
        url: 'https://shop.example.com/products/SOFA-3000',
      },
    }
    const feed = adaptWebProductSource({
      source,
      sourceUrl: 'https://shop.example.com/products/SOFA-3000',
      catalog,
      overrides: baseOverrides,
    })
    const product = importCatalogProtocol(feed).products[0]

    expect(product).toMatchObject({
      id: 'catalog:schemaorg-example:SOFA-3000',
      name: '구조화 소파',
      brand: '예제가구',
      dims: { w: 3000, d: 950, h: 870 },
      price: 2237000,
      catalog: {
        sourceImageUrls: ['https://cdn.example.com/sofa.jpg'],
        materials: ['천연가죽', '알루미늄'],
      },
    })
  })

  it('리바트형 OpenGraph HTML을 치수 override와 결합한다', () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="리르 3시트 w3000 가죽 소파">
      <meta property="og:image" content="https://static.hyundailivart.co.kr/sofa.jpg">
      <meta property="product:price:amount" content="2237000">
      <meta property="product:price:currency" content="KRW">
    </head></html>`
    const input: WebProductAdapterInput = {
      source: html,
      sourceUrl: 'https://www.hyundailivart.co.kr/p/P200089504',
      catalog: { ...catalog, id: 'hyundai-livart-ko', provider: 'Hyundai Livart' },
      overrides: {
        ...baseOverrides,
        externalId: 'P200089504',
        sku: 'P200089504',
        brand: '리바트',
        dimensions: { width: 3000, depth: 950, height: 870, unit: 'mm' },
        materials: ['천연 황소 가죽', 'PVC'],
      },
    }
    const product = importCatalogProtocol(adaptWebProductSource(input)).products[0]

    expect(product).toMatchObject({
      id: 'catalog:hyundai-livart-ko:P200089504',
      brand: '리바트',
      dims: { w: 3000, d: 950, h: 870 },
      price: 2237000,
    })
  })

  it('원본과 override 모두 W/D/H가 없으면 경로별로 거절한다', () => {
    expect(() =>
      adaptWebProductSource({
        source: { '@type': 'Product', name: '치수 없는 제품', sku: 'NO-DIMS' },
        sourceUrl: 'https://shop.example.com/no-dims',
        catalog,
        overrides: { ...baseOverrides, brand: '예제가구' },
      })
    ).toThrow(InvalidWebProductSourceError)
    try {
      adaptWebProductSource({
        source: { '@type': 'Product', name: '치수 없는 제품', sku: 'NO-DIMS' },
        sourceUrl: 'https://shop.example.com/no-dims',
        catalog,
        overrides: { ...baseOverrides, brand: '예제가구' },
      })
    } catch (error) {
      expect((error as InvalidWebProductSourceError).issues).toContainEqual(
        expect.objectContaining({ code: 'dimension-missing', path: '$.dimensions' })
      )
    }
  })
})
