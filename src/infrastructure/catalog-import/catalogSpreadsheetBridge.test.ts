import { describe, expect, it } from 'vitest'
import {
  importCatalogProtocol,
  InvalidCatalogProtocolError,
} from '../../application/catalogProtocol'
import {
  catalogRowsToProtocol,
  parseCatalogCsv,
  type CatalogSheetConfig,
} from './catalogSpreadsheetBridge'

const config: CatalogSheetConfig = {
  catalog: {
    id: 'livart-sheet',
    provider: 'Hyundai Livart',
    locale: 'ko-KR',
    generatedAt: '2026-08-31T00:00:00.000Z',
  },
  defaults: {
    brand: '리바트',
    mount: 'floor',
    shape_hint: 'box',
  },
}

describe('catalog CSV/XLSX row bridge', () => {
  it('quoted CSV·단위·다중 값·가격·의존성을 protocol로 변환한다', () => {
    const csv = [
      [
        'external_id',
        'name',
        'sku',
        'category',
        'width',
        'depth',
        'height',
        'unit',
        'source_url',
        'retrieved_at',
        'price_amount',
        'price_currency',
        'price_checked_at',
        'price_basis',
        'materials',
        'tags',
        'provides',
      ].join(','),
      [
        'P200089504',
        '"리르 3시트, w3000 가죽 소파"',
        'P200089504',
        'seating.sofa',
        '300',
        '95',
        '87',
        'cm',
        'https://www.hyundailivart.co.kr/p/P200089504',
        '2026-08-31T00:00:00.000Z',
        '2237000',
        'KRW',
        '2026-08-31',
        '"본체 1개, 옵션 별도"',
        '천연가죽|PVC|알루미늄',
        '4인용|가죽',
        'seating.sofa',
      ].join(','),
    ].join('\n')

    const product = importCatalogProtocol(parseCatalogCsv(csv, config)).products[0]

    expect(product).toMatchObject({
      id: 'catalog:livart-sheet:P200089504',
      name: '리르 3시트, w3000 가죽 소파',
      brand: '리바트',
      dims: { w: 3000, d: 950, h: 870 },
      price: 2237000,
      catalog: {
        tags: ['4인용', '가죽'],
        materials: ['천연가죽', 'PVC', '알루미늄'],
      },
      installation: { provides: ['seating.sofa'] },
    })
    expect(product.retail?.priceBasis).toBe('본체 1개, 옵션 별도')
  })

  it('필수 치수 셀이 비면 기존 protocol의 행 경로 오류로 거절한다', () => {
    const rows = [
      {
        external_id: 'NO-HEIGHT',
        name: '높이 없는 제품',
        brand: '리바트',
        category: 'seating.sofa',
        width: 2000,
        depth: 900,
        unit: 'mm',
        source_url: 'https://example.com/no-height',
        retrieved_at: '2026-08-31T00:00:00.000Z',
        mount: 'floor',
      },
    ]

    expect(() => importCatalogProtocol(catalogRowsToProtocol(rows, config))).toThrow(
      InvalidCatalogProtocolError
    )
    try {
      importCatalogProtocol(catalogRowsToProtocol(rows, config))
    } catch (error) {
      expect((error as InvalidCatalogProtocolError).issues).toContainEqual(
        expect.objectContaining({
          code: 'dimension-invalid',
          path: '$.products[0].dimensions.height',
        })
      )
    }
  })

  it('한샘 preset 기본값을 빈 셀에만 적용하고 행 값을 덮어쓰지 않는다', () => {
    const feed = catalogRowsToProtocol(
      [
        {
          external_id: 'HS-LOWER-2400',
          name: '키친바흐 하부장 2400',
          category: 'kitchen.base-cabinet',
          width: 2400,
          depth: 600,
          height: 850,
          unit: 'mm',
          source_url: 'https://store.hanssem.com/category/20009',
          retrieved_at: '2026-08-31T00:00:00.000Z',
          shape_hint: 'sinkLower',
          provides: 'kitchen.base-cabinet|kitchen.countertop',
        },
      ],
      {
        catalog: { ...config.catalog, id: 'hanssem-sheet', provider: 'Hanssem' },
        defaults: { brand: '한샘', mount: 'floor', shape_hint: 'box', snap_to_wall: true },
      }
    )
    const product = importCatalogProtocol(feed).products[0]

    expect(product).toMatchObject({
      brand: '한샘',
      shape: 'sinkLower',
      mount: 'floor',
      snapToWall: true,
      installation: { provides: ['kitchen.base-cabinet', 'kitchen.countertop'] },
    })
  })
})
