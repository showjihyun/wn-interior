import { createContext, useContext, type ReactNode } from 'react'
import type { AnalyzeFloorPlan } from '../application/analyzeFloorPlan'
import type { GenerateQuote } from '../application/generateQuote'
import type { CreateFloorPlanPreview } from '../application/createFloorPlanPreview'
import type { MaterialCatalog, ProductCatalog, TextFileExporter } from '../application/ports'
import type { AppStore } from './state/store'
import type { FinishMaterialView } from './materialTypes'
import type { SceneSurfaceRegistry } from './scene/SceneSurfaceRegistry'
import type { ProductTextureEngine } from './texture/ProductTextureEngine'
import type { ProductVisualResolver } from '../application/productVisual'
import type { ProductVisualStatusRegistry } from './scene/ProductVisualStatusRegistry'

export interface AppRuntime {
  store: AppStore
  analyzeFloorPlan: AnalyzeFloorPlan
  planVision: CreateFloorPlanPreview
  textFileExporter: TextFileExporter
  productCatalog: ProductCatalog
  catalogFileToProtocol(file: File): Promise<Record<string, unknown>>
  materialCatalog: MaterialCatalog
  generateQuote: GenerateQuote
  finishMaterials: readonly FinishMaterialView[]
  sceneSurface: SceneSurfaceRegistry
  productTextureEngine: ProductTextureEngine
  productVisuals: ProductVisualResolver
  productVisualStatus: ProductVisualStatusRegistry
  planVisionFeatures: {
    segmentationEnabled: boolean
    roomPredictionEnabled: boolean
    roomPredictionDefault: boolean
  }
  projectStorage: {
    kind: 'indexeddb' | 'session'
    workspaceId?: string
  }
}

const AppRuntimeContext = createContext<AppRuntime | null>(null)

export function AppRuntimeProvider({
  runtime,
  children,
}: {
  runtime: AppRuntime
  children: ReactNode
}) {
  return <AppRuntimeContext.Provider value={runtime}>{children}</AppRuntimeContext.Provider>
}

export function useAppRuntime(): AppRuntime {
  const runtime = useContext(AppRuntimeContext)
  if (!runtime) throw new Error('AppRuntimeProvider가 필요합니다.')
  return runtime
}

export function useStore(): ReturnType<AppStore['getState']>
export function useStore<T>(selector: (state: ReturnType<AppStore['getState']>) => T): T
export function useStore<T = ReturnType<AppStore['getState']>>(
  selector?: (state: ReturnType<AppStore['getState']>) => T
): T {
  const store = useAppRuntime().store
  const resolved = selector ?? ((state: ReturnType<AppStore['getState']>) => state as unknown as T)
  return store(resolved)
}

export function useStoreApi(): AppStore {
  return useAppRuntime().store
}
