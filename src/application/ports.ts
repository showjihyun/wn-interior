import type { FloorPlan, Placement, Product, Project } from '../domain/model'
import type { AiSettings } from './aiSettings'
import type { Gray } from '../domain/engine/planVision'
import type { Raster2SeqPrediction } from '../domain/engine/raster2seqRooms'
import type { ApprovedProductMesh } from './productMeshApproval'

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: string
  createdAt: string
}

export interface ProjectRepository {
  list(): ProjectMeta[]
  load(id: string): Project | null
  save(project: Project): void
  delete(id: string): void
}

export interface LegacyProjectSource {
  load(): Project | null
  remove(): void
}

export interface AiSettingsRepository {
  load(): AiSettings | null
  save(settings: AiSettings): void
}

export interface IdGenerator {
  next(): string
}

export interface Clock {
  now(): string
}

export interface StarterProjectTemplate {
  name: string
  plan: FloorPlan
  placements: Array<Omit<Placement, 'id'>>
  customProducts: Product[]
}

export interface StarterProjectProvider {
  getStarterProject(): StarterProjectTemplate
}

export interface ProductCatalog {
  list(): readonly Product[]
  findById(id: string): Product | undefined
}

export interface ApprovedProductMeshCatalog {
  findForProduct(productId: string, productFingerprint: string): ApprovedProductMesh | undefined
  list(): readonly ApprovedProductMesh[]
}

export interface MaterialReference {
  id: string
  kind: 'floor' | 'wall'
  name: string
}

export interface MaterialCatalog {
  list(): readonly MaterialReference[]
  findById(id: string): MaterialReference | undefined
}

export interface Delay {
  wait(milliseconds: number): Promise<void>
}

export interface ScheduledTask {
  cancel(): void
}

export interface Scheduler {
  schedule(task: () => void, delayMs: number): ScheduledTask
}

export interface AiVisionGateway {
  request(settings: AiSettings, imageDataUrl: string): Promise<string>
}

export interface AnalysisProgress {
  attempt: number
  maxRetries: number
  retryAfterMs: number
}

export interface SemanticFloorPlanMasks {
  walls: Gray
  openings: { door: Gray; window: Gray }
  engineLabel: string
  durationMs: number
}

export interface RoomPredictionResult extends Raster2SeqPrediction {
  engineLabel: string
  durationMs: number
}

export interface PlanVisionGateway {
  segment(imageDataUrl: string): Promise<SemanticFloorPlanMasks>
  rooms(imageDataUrl: string): Promise<RoomPredictionResult>
}

export interface TextFileExporter {
  download(text: string, filename: string, mimeType: string): void
}

export type ServiceFailureKind =
  'unauthorized' | 'quota-exhausted' | 'rate-limited' | 'unavailable' | 'invalid-response'

export class ExternalServiceError extends Error {
  public readonly detail?: string

  constructor(
    public readonly kind: ServiceFailureKind,
    cause?: unknown
  ) {
    super(kind)
    this.name = 'ExternalServiceError'
    this.detail = cause instanceof Error ? cause.message : cause ? String(cause) : undefined
  }
}

export interface FloorPlanAnalysis {
  plan: FloorPlan
  raw: string
}
