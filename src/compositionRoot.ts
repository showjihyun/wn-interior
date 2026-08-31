import { DEFAULT_AI_SETTINGS } from './application/aiSettings'
import { createAnalyzeFloorPlan } from './application/analyzeFloorPlan'
import { createGenerateQuote } from './application/generateQuote'
import { createProjectService } from './application/projectService'
import { createAutoSave } from './application/autoSave'
import { createFloorPlanPreview } from './application/createFloorPlanPreview'
import {
  createProductVisualResolver,
  type LocalReviewProductMesh,
} from './application/productVisual'
import { OpenAiCompatibleVisionGateway } from './infrastructure/ai/OpenAiCompatibleVisionGateway'
import { BrowserTextFileExporter } from './infrastructure/browser/BrowserTextFileExporter'
import { HttpPlanVisionGateway } from './infrastructure/cv/HttpPlanVisionGateway'
import { BrowserMaskDecoder } from './infrastructure/cv/BrowserMaskDecoder'
import { LocalStorageAiSettingsRepository } from './infrastructure/persistence/LocalStorageAiSettingsRepository'
import { LocalStorageLegacyProjectSource } from './infrastructure/persistence/LocalStorageLegacyProjectSource'
import { SessionStorageProjectRepository } from './infrastructure/persistence/LocalStorageProjectRepository'
import {
  BrowserIdGenerator,
  BrowserScheduler,
  SystemClock,
  SystemDelay,
} from './infrastructure/runtime/BrowserRuntime'
import {
  StaticMaterialCatalog,
  StaticProductCatalog,
  StaticStarterProjectProvider,
} from './infrastructure/reference-data/StaticReferenceData'
import { createAppStore } from './presentation/state/store'
import type { AppRuntime } from './presentation/AppRuntimeContext'
import { SceneSurfaceRegistry } from './presentation/scene/SceneSurfaceRegistry'
import { ProductTextureEngine } from './presentation/texture/ProductTextureEngine'
import { FLOOR_MATERIALS, WALL_MATERIALS } from './infrastructure/reference-data/data/materials'
import { StaticApprovedMeshCatalog } from './infrastructure/generated-mesh/StaticApprovedMeshCatalog'
import type { ProductCatalog, ProjectRepository } from './application/ports'
import { ProductVisualStatusRegistry } from './presentation/scene/ProductVisualStatusRegistry'
import type { Product } from './domain/model'
import {
  createDurableSessionProjectRepository,
  IndexedDbProjectDatabase,
  migrateProjectRepository,
} from './infrastructure/persistence/IndexedDbProjectRepository'
import { resolveBrowserWorkspaceId } from './infrastructure/persistence/BrowserSessionWorkspace'

const cvServerUrl =
  (import.meta.env.VITE_CV_SERVER_URL as string | undefined)?.replace(/\/+$/, '') ??
  'http://127.0.0.1:8976'
const raster2SeqServerUrl =
  (import.meta.env.VITE_RASTER2SEQ_SERVER_URL as string | undefined)?.replace(/\/+$/, '') ??
  'http://127.0.0.1:8977'
const nonCommercialResearch = import.meta.env.VITE_ENABLE_NONCOMMERCIAL_RESEARCH_MODE === 'true'

export interface ApplicationComposition {
  runtime: AppRuntime
}

export interface ApplicationCompositionOptions {
  projectRepository?: ProjectRepository
  projectStorage?: AppRuntime['projectStorage']
}

export function createApplicationComposition(
  options: ApplicationCompositionOptions = {}
): ApplicationComposition {
  const projectRepository = options.projectRepository ?? new SessionStorageProjectRepository()
  const ids = new BrowserIdGenerator()
  const clock = new SystemClock()
  const baseProductCatalog = new StaticProductCatalog()
  const testMeshFixture = (
    import.meta.env.VITE_E2E_MESH_FIXTURE_PAYLOAD
      ? JSON.parse(import.meta.env.VITE_E2E_MESH_FIXTURE_PAYLOAD)
      : null
  ) as { product: Product; manifest: unknown } | null
  const localMeshReview = (
    import.meta.env.VITE_LOCAL_MESH_REVIEW_PAYLOAD
      ? JSON.parse(import.meta.env.VITE_LOCAL_MESH_REVIEW_PAYLOAD)
      : null
  ) as LocalReviewProductMesh | null
  const productCatalog: ProductCatalog = testMeshFixture
    ? {
        list: () => [...baseProductCatalog.list(), testMeshFixture.product],
        findById: (id) =>
          id === testMeshFixture.product.id
            ? testMeshFixture.product
            : baseProductCatalog.findById(id),
      }
    : baseProductCatalog
  const approvedMeshes = new StaticApprovedMeshCatalog(productCatalog, testMeshFixture?.manifest)
  const materialCatalog = new StaticMaterialCatalog()
  const projectService = createProjectService({
    repository: projectRepository,
    legacySource: new LocalStorageLegacyProjectSource(),
    ids,
    clock,
    starterProjectProvider: new StaticStarterProjectProvider(),
  })
  const runtime: AppRuntime = {
    analyzeFloorPlan: createAnalyzeFloorPlan(
      new OpenAiCompatibleVisionGateway(),
      new SystemDelay()
    ),
    planVision: createFloorPlanPreview(
      new HttpPlanVisionGateway(cvServerUrl, raster2SeqServerUrl, new BrowserMaskDecoder())
    ),
    textFileExporter: new BrowserTextFileExporter(),
    productCatalog,
    materialCatalog,
    generateQuote: createGenerateQuote({
      clock,
      products: productCatalog,
      materials: materialCatalog,
    }),
    finishMaterials: [...FLOOR_MATERIALS, ...WALL_MATERIALS],
    sceneSurface: new SceneSurfaceRegistry(),
    productTextureEngine: new ProductTextureEngine(),
    productVisuals: createProductVisualResolver(
      approvedMeshes,
      localMeshReview ? [localMeshReview] : []
    ),
    productVisualStatus: new ProductVisualStatusRegistry(),
    planVisionFeatures: {
      segmentationEnabled: import.meta.env.MODE === 'development' || nonCommercialResearch,
      roomPredictionEnabled: nonCommercialResearch,
      roomPredictionDefault:
        nonCommercialResearch && import.meta.env.VITE_ROOM_POLYGON_ENGINE === 'raster2seq',
    },
    projectStorage: options.projectStorage ?? { kind: 'session' },
    store: createAppStore({
      projectService,
      ids,
      clock,
      aiSettingsRepository: new LocalStorageAiSettingsRepository(),
      defaultAiSettings: {
        ...DEFAULT_AI_SETTINGS,
        apiKey: '',
      },
      productCatalog,
      autoSave: createAutoSave(projectService, new BrowserScheduler()),
    }),
  }
  return { runtime }
}

export async function createBrowserApplicationComposition(): Promise<ApplicationComposition> {
  let sessionRepository = new SessionStorageProjectRepository()
  try {
    const workspaceId = resolveBrowserWorkspaceId({
      location: window.location,
      history: window.history,
      storage: sessionStorage,
      nextId: () => crypto.randomUUID(),
    })
    const scopedSessionRepository = new SessionStorageProjectRepository(
      sessionStorage,
      `hp3d.workspace.${workspaceId}`
    )
    migrateProjectRepository(sessionRepository, scopedSessionRepository)
    sessionRepository = scopedSessionRepository
    const projectRepository = await createDurableSessionProjectRepository({
      workspaceId,
      database: new IndexedDbProjectDatabase(),
      sessionRepository,
    })
    return createApplicationComposition({
      projectRepository,
      projectStorage: { kind: 'indexeddb', workspaceId },
    })
  } catch {
    return createApplicationComposition({
      projectRepository: sessionRepository,
      projectStorage: { kind: 'session' },
    })
  }
}
