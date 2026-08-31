import type { FloorPlan, Placement } from '../domain/model'
import { buildCostReport } from '../domain/costs'
import { buildQuoteText } from './quoteDocument'
import type { Clock, MaterialCatalog, ProductCatalog } from './ports'

export interface GenerateQuoteInput {
  projectName: string
  plan: FloorPlan
  placements: Placement[]
}

export interface GenerateQuote {
  execute(input: GenerateQuoteInput): string
}

export interface GenerateQuoteDependencies {
  clock: Clock
  products: ProductCatalog
  materials: MaterialCatalog
}

export function createGenerateQuote({
  clock,
  products,
  materials,
}: GenerateQuoteDependencies): GenerateQuote {
  return {
    execute({ projectName, plan, placements }) {
      const report = buildCostReport(placements, (id) => products.findById(id))
      return buildQuoteText(projectName, report, plan, {
        generatedAt: clock.now(),
        materialNameOf: (id) => (id ? materials.findById(id)?.name : undefined),
      })
    },
  }
}
