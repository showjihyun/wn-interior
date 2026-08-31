import type {
  MaterialCatalog,
  MaterialReference,
  ProductCatalog,
  StarterProjectProvider,
  StarterProjectTemplate,
} from '../../application/ports'
import type { Product } from '../../domain/model'
import { CATALOG } from './data/catalog'
import { FLOOR_MATERIALS, WALL_MATERIALS } from './data/materials'
import { SAMPLE_PLACEMENTS, SAMPLE_PLAN } from './data/samplePlan'

export class StaticStarterProjectProvider implements StarterProjectProvider {
  getStarterProject(): StarterProjectTemplate {
    return {
      name: '샘플 아파트 (34평형)',
      plan: SAMPLE_PLAN,
      placements: SAMPLE_PLACEMENTS,
      customProducts: [],
    }
  }
}

export class StaticProductCatalog implements ProductCatalog {
  list(): readonly Product[] {
    return CATALOG
  }

  findById(id: string): Product | undefined {
    return CATALOG.find((product) => product.id === id)
  }
}

const MATERIALS: readonly MaterialReference[] = [...FLOOR_MATERIALS, ...WALL_MATERIALS]

export class StaticMaterialCatalog implements MaterialCatalog {
  list(): readonly MaterialReference[] {
    return MATERIALS
  }

  findById(id: string): MaterialReference | undefined {
    return MATERIALS.find((material) => material.id === id)
  }
}
