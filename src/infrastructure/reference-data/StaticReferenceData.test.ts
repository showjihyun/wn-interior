import { describe, expect, it } from 'vitest'
import {
  StaticMaterialCatalog,
  StaticProductCatalog,
  StaticStarterProjectProvider,
} from './StaticReferenceData'

describe('StaticReferenceData adapters', () => {
  it('기존 샘플과 카탈로그 데이터를 포트 계약으로 제공한다', () => {
    const starter = new StaticStarterProjectProvider().getStarterProject()
    const products = new StaticProductCatalog()
    const materials = new StaticMaterialCatalog()

    expect(starter.plan.walls.length).toBeGreaterThan(0)
    expect(starter.placements.length).toBeGreaterThan(0)
    expect(products.findById('p-sofa3')?.name).toBeTruthy()
    expect(materials.findById('f-wood-natural')?.kind).toBe('floor')
    expect(products.list().length).toBeGreaterThan(0)
    expect(materials.list().length).toBeGreaterThan(0)
  })
})
