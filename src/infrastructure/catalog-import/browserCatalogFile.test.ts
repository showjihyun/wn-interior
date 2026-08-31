import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { importCatalogProtocol } from '../../application/catalogProtocol'
import { catalogFileToProtocol, UnsupportedCatalogFileError } from './browserCatalogFile'

const NOW = () => new Date('2026-08-31T08:00:00.000Z')

describe('browser catalog file bridge', () => {
  it('한샘 CSV에서 브랜드 preset을 결정하고 Protocol feed를 만든다', async () => {
    const csv = [
      'external_id,name,brand,category,width,depth,height,unit,source_url,retrieved_at,mount,provides',
      'HS-BASE-800,한샘 하부장,한샘,kitchen.base-cabinet,800,600,850,mm,https://store.hanssem.com/,2026-08-31T00:00:00+09:00,floor,support.base-cabinet',
    ].join('\n')
    const file = new File([csv], 'hanssem-products.csv', { type: 'text/csv' })

    const imported = importCatalogProtocol(await catalogFileToProtocol(file, NOW))

    expect(imported).toMatchObject({ catalogId: 'hanssem-ko', provider: 'Hanssem' })
    expect(imported.products[0]).toMatchObject({
      id: 'catalog:hanssem-ko:HS-BASE-800',
      brand: '한샘',
      dims: { w: 800, d: 600, h: 850 },
    })
  })

  it('리바트 XLSX products 시트를 브라우저에서 읽는다', async () => {
    const bytes = readFileSync(
      resolve(import.meta.dirname, '../../../public/catalog-templates/livart-catalog-template.xlsx')
    )
    const file = new File([bytes], 'livart-products.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const imported = importCatalogProtocol(await catalogFileToProtocol(file, NOW))

    expect(imported).toMatchObject({ catalogId: 'hyundai-livart-ko', provider: 'Hyundai Livart' })
    expect(imported.products[0]).toMatchObject({
      id: 'catalog:hyundai-livart-ko:EXAMPLE-LV-SOFA-001',
      brand: '리바트',
      dims: { w: 3000, d: 950, h: 870 },
    })
  })

  it('preset이 없는 브랜드와 지원하지 않는 확장자를 명시적으로 거절한다', async () => {
    const unknown = new File(
      [
        [
          'external_id,name,brand,category,width,depth,height,unit,source_url,retrieved_at,mount',
          'X1,알 수 없는 제품,기타,seating.sofa,1,1,1,m,https://example.com/x,2026-08-31T00:00:00Z,floor',
        ].join('\n'),
      ],
      'unknown.csv'
    )
    await expect(catalogFileToProtocol(unknown, NOW)).rejects.toMatchObject({
      code: 'spreadsheet-brand-unsupported',
    })
    await expect(catalogFileToProtocol(new File(['x'], 'catalog.xls'), NOW)).rejects.toBeInstanceOf(
      UnsupportedCatalogFileError
    )
  })

  it('브라우저 XLSX에서는 조용한 계산 오류를 막기 위해 수식을 거절한다', async () => {
    const archive = unzipSync(
      readFileSync(
        resolve(
          import.meta.dirname,
          '../../../public/catalog-templates/hanssem-catalog-template.xlsx'
        )
      )
    )
    const sheetPath = 'xl/worksheets/sheet1.xml'
    const sheet = new TextDecoder().decode(archive[sheetPath])
    archive[sheetPath] = new TextEncoder().encode(sheet.replace(/(<c[^>]*>)/, '$1<f>1+1</f>'))
    const file = new File([zipSync(archive)], 'hanssem-formula.xlsx')

    await expect(catalogFileToProtocol(file, NOW)).rejects.toMatchObject({
      code: 'spreadsheet-formula-unsupported',
    })
  })
})
