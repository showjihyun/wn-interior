// ─────────────────────────────────────────────────────────────
// 프레젠테이션 상태 어댑터 — application 명령/히스토리/프로젝트 유스케이스를 Zustand에 바인딩
// ─────────────────────────────────────────────────────────────
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type {
  FloorPlan,
  FloorPlanReview,
  FloorPlanReviewEvidenceInput,
  Opening,
  Placement,
  Product,
  Project,
  Pt,
  Wall,
} from '../../domain/model'
import {
  floorPlanReviewBlocks3d,
  validateFloorPlanReviewEvidence,
} from '../../domain/floorPlanReview'
import type { AiSettings } from '../../application/aiSettings'
import { canDropAt } from '../../domain/engine/drop'
import { resolveDims } from '../../domain/engine/dims'
import { roomAt } from '../../domain/engine/geom'
import { requiresSurfaceHost, resolveSurfacePlacement } from '../../domain/surfacePlacement'
import { placementFailureMessage } from '../placementFailureMessage'
import {
  importCatalogProtocol,
  InvalidCatalogProtocolError,
  type CatalogProtocolIssue,
} from '../../application/catalogProtocol'
import { findBrokenInstallationDependents } from '../../domain/installationDependencies'
import type {
  AiSettingsRepository,
  Clock,
  IdGenerator,
  ProductCatalog,
  ProjectMeta,
} from '../../application/ports'
import type { ProjectService } from '../../application/projectService'
import type { AutoSave } from '../../application/autoSave'
import {
  commitPlacementMove,
  restorePlacementMove,
  type EditorSnapshot,
  type PlacementMoveOrigin,
} from '../../application/placementMoveHistory'
import {
  executeProjectEdit,
  redoProjectEdit,
  undoProjectEdit,
  type ProjectEdit,
} from '../../application/projectEditing'
import {
  findDuplicatePlacementVariant,
  placementsFromVariant,
  removePlacementVariant,
  savePlacementVariant,
  type PlacementVariant,
  type SavePlacementVariantResult,
} from '../../application/placementVariants'

export interface AppState {
  projectName: string
  projectOrigin?: Project['origin']
  plan: FloorPlan
  placements: Placement[]
  customProducts: Product[]
  floorPlanReview?: FloorPlanReview
  selectedId: string | null
  mode: '3d' | '2d'
  past: EditorSnapshot[]
  future: EditorSnapshot[]
  ai: AiSettings
  pendingProductId: string | null
  viewPreset: 'iso' | 'top' | 'walk'
  variants: PlacementVariant[]
  moving: { id: string; origin: PlacementMoveOrigin } | null
  toast: { id: number; msg: string; kind: 'error' | 'warn' | 'info' } | null
  /** 씬 조명 강도 배율 (0.2~2.0, 기본 1) */
  lightIntensity: number
  /** 워크스루 캐릭터 설정 */
  walkConfig: { heightCm: number; weightKg: number }
  walkView: 'fp' | 'tp'
  showDims3D: boolean
  projectId: string
  projects: ProjectMeta[]

  setLightIntensity: (v: number) => void
  setWalkConfig: (patch: Partial<{ heightCm: number; weightKg: number }>) => void
  setWalkView: (v: 'fp' | 'tp') => void
  toggleDims3D: () => void
  newProject: (name?: string) => void
  openProject: (id: string) => void
  deleteProject: (id: string) => void
  refreshProjects: () => void

  setPending: (id: string | null) => void
  setViewPreset: (v: 'iso' | 'top' | 'walk') => void
  saveVariant: (name: string, thumb?: string) => SavePlacementVariantResult
  applyVariant: (id: string) => void
  removeVariant: (id: string) => void
  beginMove: (id: string, origin: PlacementMoveOrigin) => void
  confirmMove: () => void
  cancelMove: () => void
  showToast: (msg: string, kind?: 'error' | 'warn' | 'info') => void

  undo: () => void
  redo: () => void
  select: (id: string | null) => void
  setMode: (m: '3d' | '2d') => void
  completeFloorPlanReview: (evidence?: FloorPlanReviewEvidenceInput) => boolean

  addPlacement: (productId: string, pos: { x: number; z: number }, rotY?: number) => string | null
  updatePlacement: (id: string, patch: Partial<Placement>) => void
  movePlacement: (id: string, x: number, z: number, roomId?: string) => void
  relocatePlacement: (id: string, x: number, z: number) => boolean
  removePlacement: (id: string) => void
  duplicatePlacement: (id: string) => void

  setRoomMaterial: (
    roomId: string,
    kind: 'floorMaterialId' | 'wallMaterialId',
    materialId: string
  ) => void
  renameRoom: (roomId: string, name: string) => void

  addWall: (a: Pt, b: Pt, thickness?: number) => void
  updateWall: (wallId: string, patch: Partial<Wall>) => void
  removeWall: (wallId: string) => void
  addOpening: (op: Omit<Opening, 'id'>) => void
  updateOpening: (opId: string, patch: Partial<Opening>) => void
  removeOpening: (opId: string) => void
  setWallHeight: (h: number) => void

  addCustomProduct: (p: Omit<Product, 'id'>) => string
  importProductCatalog: (text: string) => {
    ok: boolean
    imported: number
    updated: number
    issues: CatalogProtocolIssue[]
  }
  loadProject: (p: Project) => void
  exportProject: () => Project
  resetToSample: () => void
  setAi: (patch: Partial<AiSettings>) => void

  productById: (id: string) => Product | undefined
}

export interface StoreDependencies {
  projectService: ProjectService
  ids: IdGenerator
  clock: Clock
  aiSettingsRepository: AiSettingsRepository
  defaultAiSettings: AiSettings
  productCatalog: ProductCatalog
  autoSave: AutoSave
}

export type AppStore = UseBoundStore<StoreApi<AppState>>

export function createAppStore({
  projectService,
  ids,
  clock,
  aiSettingsRepository,
  defaultAiSettings,
  productCatalog,
  autoSave,
}: StoreDependencies): AppStore {
  const persist = (state: AppState) => {
    autoSave.schedule({
      id: state.projectId,
      name: state.projectName,
      origin: state.projectOrigin,
      plan: state.plan,
      placements: state.placements,
      customProducts: state.customProducts,
      floorPlanReview: state.floorPlanReview,
    })
  }
  const uid = () => ids.next()
  const init = projectService.initialize()
  const savedAi = aiSettingsRepository.load()

  const store = create<AppState>((set, get) => {
    const commitEdit = (edit: ProjectEdit) =>
      set((state) => {
        const edited = executeProjectEdit(state, edit)
        const next: AppState = { ...state, ...edited, moving: null }
        persist(next)
        return next
      })

    return {
      projectName: init.name,
      projectOrigin: init.origin,
      projectId: init.id ?? 'current',
      projects: projectService.list(),
      plan: init.plan,
      placements: init.placements,
      customProducts: init.customProducts,
      floorPlanReview: init.floorPlanReview,
      selectedId: null,
      mode: floorPlanReviewBlocks3d(init.origin, init.floorPlanReview) ? '2d' : '3d',
      past: [],
      future: [],
      pendingProductId: null,
      viewPreset: 'iso',
      variants: [],
      moving: null,
      toast: null,
      lightIntensity: 1,
      walkConfig: { heightCm: 170, weightKg: 65 },
      walkView: 'fp',
      showDims3D: true,

      setLightIntensity: (v) => set({ lightIntensity: Math.max(0.2, Math.min(2, v)) }),
      setWalkConfig: (patch) => set((s) => ({ walkConfig: { ...s.walkConfig, ...patch } })),
      setWalkView: (v) => set({ walkView: v }),
      toggleDims3D: () => set((s) => ({ showDims3D: !s.showDims3D })),
      ai: {
        ...defaultAiSettings,
        ...savedAi,
      },

      productById: (id) =>
        productCatalog.findById(id) ?? get().customProducts.find((c) => c.id === id),

      undo: () =>
        set((s) => {
          const edited = undoProjectEdit(s)
          if (!edited) return s
          const next: AppState = { ...s, ...edited, moving: null }
          persist(next)
          return next
        }),

      redo: () =>
        set((s) => {
          const edited = redoProjectEdit(s)
          if (!edited) return s
          const next: AppState = { ...s, ...edited, moving: null }
          persist(next)
          return next
        }),

      select: (id) => set({ selectedId: id }),
      setMode: (m) => {
        const state = get()
        if (m === '3d' && floorPlanReviewBlocks3d(state.projectOrigin, state.floorPlanReview)) {
          state.showToast('원본과 대표 요소의 2D 검수 근거를 저장한 뒤 3D로 이동할 수 있어요')
          return
        }
        set({ mode: m })
      },
      completeFloorPlanReview: (evidence) => {
        const review = get().floorPlanReview
        if (!review) return false
        const validation = validateFloorPlanReviewEvidence(get().plan, review, evidence)
        if (!validation.ok) {
          const messages = {
            'evidence-required': '대표 요소와 검수 근거를 입력하세요',
            'target-not-found': '검수할 대표 요소를 다시 선택하세요',
            'note-too-short': '검수 근거를 5자 이상 입력하세요',
            'plan-change-required': '수정 완료는 실제 도면 변경이 있어야 선택할 수 있습니다',
          }
          get().showToast(messages[validation.reason])
          return false
        }
        const recordedAt = clock.now()
        const floorPlanReview: FloorPlanReview = {
          ...review,
          status: 'completed',
          evidence: {
            ...evidence!,
            targetLabel: validation.targetLabel,
            note: validation.note,
            planFingerprint: validation.planFingerprint,
            recordedAt,
          },
          completedAt: recordedAt,
        }
        set({ floorPlanReview })
        persist(get())
        return true
      },
      setPending: (id) =>
        set((s) => ({ pendingProductId: id, selectedId: id === null ? s.selectedId : null })),
      setViewPreset: (v) => set({ viewPreset: v }),

      saveVariant: (name, thumb) => {
        const state = get()
        const duplicate = findDuplicatePlacementVariant(state.variants, state.placements)
        if (duplicate) return { saved: false, duplicateName: duplicate.name }
        set({
          variants: savePlacementVariant({
            variants: state.variants,
            id: uid(),
            name,
            thumb,
            placements: state.placements,
          }),
        })
        return { saved: true }
      },

      applyVariant: (id) =>
        (() => {
          const placements = placementsFromVariant(get().variants, id)
          if (placements) commitEdit({ type: 'replace-placements', placements })
        })(),

      removeVariant: (id) => set((s) => ({ variants: removePlacementVariant(s.variants, id) })),

      beginMove: (id, origin) => set({ moving: { id, origin } }),

      confirmMove: () => {
        const s = get()
        const mv = s.moving
        if (!mv) return
        const pl = s.placements.find((p) => p.id === mv.id)
        const prod = pl ? s.productById(pl.productId) : undefined
        if (!pl || !prod) {
          set({ moving: null })
          return
        }
        const effProduct = { ...prod, dims: resolveDims(prod, pl) }
        const r = canDropAt(
          s.plan,
          effProduct,
          s.placements,
          mv.id,
          pl.pos.x,
          pl.pos.z,
          pl.rotY,
          s.productById
        )
        if (r.ok) {
          const history = commitPlacementMove(s, mv)
          if (!history) {
            set({ moving: null })
            return
          }
          const next = { ...s, ...history, moving: null }
          set(next)
          persist(next)
        } else {
          set({ placements: restorePlacementMove(s.placements, mv), moving: null })
          get().showToast('공간이 부족해 배치할 수 없어요')
        }
      },

      cancelMove: () => {
        const s = get()
        const mv = s.moving
        if (!mv) return
        set({ placements: restorePlacementMove(s.placements, mv), moving: null })
      },

      showToast: (msg, kind = 'warn') => {
        const tid = Date.now()
        set({ toast: { id: tid, msg, kind } })
        setTimeout(() => {
          if (get().toast?.id === tid) set({ toast: null })
        }, 2600)
      },

      addPlacement: (productId, pos, rotY = 0) => {
        const state = get()
        const prod = state.productById(productId)
        if (!prod) return null
        const x = Math.round(pos.x)
        const z = Math.round(pos.z)
        const surface = resolveSurfacePlacement(prod, state.placements, x, z, state.productById)
        if (requiresSurfaceHost(prod) && !surface) {
          state.showToast(placementFailureMessage(prod, { ok: false, reason: 'surface-required' }))
          return null
        }
        const target = surface ?? { x, z, rotY, elevation: 0, supportPlacementId: undefined }
        const result = canDropAt(
          state.plan,
          prod,
          state.placements,
          null,
          target.x,
          target.z,
          target.rotY,
          state.productById
        )
        if (!result.ok) {
          state.showToast(placementFailureMessage(prod, result))
          return null
        }
        const room = roomAt(state.plan, target.x, target.z)
        if (!room) return null
        const id = uid()
        commitEdit({
          type: 'add-placement',
          placement: {
            id,
            productId,
            roomId: room.id,
            pos: { x: target.x, y: target.elevation, z: target.z },
            rotY: target.rotY,
            colorway: prod.colorways?.[0],
            elevationOverride: surface?.elevation,
            supportPlacementId: surface?.supportPlacementId,
          },
        })
        set({ selectedId: id })
        return id
      },

      updatePlacement: (id, patch) => commitEdit({ type: 'update-placement', id, patch }),

      movePlacement: (id, x, z, roomId) =>
        set((s) => ({
          ...s,
          placements: s.placements.map((p) =>
            p.id === id
              ? { ...p, pos: { ...p.pos, x: Math.round(x), z: Math.round(z) }, roomId }
              : p
          ),
        })),

      relocatePlacement: (id, x, z) => {
        const state = get()
        const placement = state.placements.find((candidate) => candidate.id === id)
        const product = placement ? state.productById(placement.productId) : undefined
        if (!placement || !product) return false
        const effective = { ...product, dims: resolveDims(product, placement) }
        const result = canDropAt(
          state.plan,
          effective,
          state.placements,
          id,
          x,
          z,
          placement.rotY,
          state.productById
        )
        if (!result.ok) {
          state.showToast(
            result.reason === 'out-of-room'
              ? '방 안에만 배치할 수 있어요'
              : '공간이 부족해 배치할 수 없어요'
          )
          return false
        }
        commitEdit({
          type: 'update-placement',
          id,
          patch: {
            pos: { ...placement.pos, x: Math.round(x), z: Math.round(z) },
            roomId: roomAt(state.plan, x, z)?.id,
          },
        })
        return true
      },

      removePlacement: (id) => {
        const state = get()
        const dependents = findBrokenInstallationDependents(id, state.placements, state.productById)
        if (dependents.length) {
          state.showToast(`종속 제품 ${dependents.length}개를 먼저 삭제하세요`)
          return
        }
        commitEdit({ type: 'remove-placement', id })
        if (get().selectedId === id) set({ selectedId: null })
      },
      duplicatePlacement: (id) => {
        if (!get().placements.some((placement) => placement.id === id)) return
        const nid = uid()
        commitEdit({ type: 'duplicate-placement', sourceId: id, placementId: nid })
        set({ selectedId: nid })
      },

      setRoomMaterial: (roomId, kind, materialId) =>
        commitEdit({ type: 'set-room-material', roomId, kind, materialId }),

      renameRoom: (roomId, name) => commitEdit({ type: 'rename-room', roomId, name }),

      addWall: (a, b, thickness = 120) =>
        commitEdit({ type: 'add-wall', wall: { id: uid(), a, b, thickness } }),

      updateWall: (wallId, patch) => commitEdit({ type: 'update-wall', wallId, patch }),

      removeWall: (wallId) => commitEdit({ type: 'remove-wall', wallId }),

      addOpening: (op) => commitEdit({ type: 'add-opening', opening: { ...op, id: uid() } }),

      updateOpening: (opId, patch) =>
        commitEdit({ type: 'update-opening', openingId: opId, patch }),

      removeOpening: (opId) => commitEdit({ type: 'remove-opening', openingId: opId }),

      setWallHeight: (h) => commitEdit({ type: 'set-wall-height', height: h }),

      addCustomProduct: (p) => {
        const id = 'custom-' + uid()
        commitEdit({ type: 'add-custom-product', product: { ...p, id } })
        return id
      },

      importProductCatalog: (text) => {
        try {
          const result = importCatalogProtocol(text)
          const existing = new Set(get().customProducts.map((product) => product.id))
          const updated = result.products.filter((product) => existing.has(product.id)).length
          const imported = result.products.length - updated
          commitEdit({ type: 'import-products', products: result.products })
          get().showToast(`카탈로그 신규 ${imported}개·갱신 ${updated}개`, 'info')
          return { ok: true, imported, updated, issues: result.issues }
        } catch (error) {
          const issues =
            error instanceof InvalidCatalogProtocolError
              ? error.issues
              : [
                  {
                    severity: 'error' as const,
                    code: 'import-failed',
                    path: '$',
                    message: 'catalog import failed',
                  },
                ]
          get().showToast('카탈로그 Import를 거절했어요', 'error')
          return { ok: false, imported: 0, updated: 0, issues }
        }
      },

      loadProject: (p) => {
        // AI/CV/가져오기 결과는 항상 별도 프로젝트로 저장 — 현재 프로젝트 보존
        const st = get()
        const proj = projectService.importProject(p)
        const id = proj.id ?? st.projectId
        set({
          projectName: proj.name,
          projectOrigin: proj.origin,
          projectId: id,
          projects: projectService.list(),
          plan: proj.plan,
          placements: proj.placements,
          customProducts: proj.customProducts ?? [],
          floorPlanReview: proj.floorPlanReview,
          past: [],
          future: [],
          selectedId: null,
          moving: null,
          mode: floorPlanReviewBlocks3d(proj.origin, proj.floorPlanReview) ? '2d' : get().mode,
        })
      },

      exportProject: () => {
        const s = get()
        const now = clock.now()
        return {
          version: 1,
          name: s.projectName,
          origin: s.projectOrigin,
          plan: s.plan,
          placements: s.placements,
          customProducts: s.customProducts,
          floorPlanReview: s.floorPlanReview,
          createdAt: now,
          updatedAt: now,
        }
      },

      resetToSample: () => {
        const starter = projectService.starter()
        set({
          projectName: starter.name,
          projectOrigin: 'sample',
          plan: starter.plan,
          placements: starter.placements,
          customProducts: starter.customProducts,
          floorPlanReview: undefined,
          past: [],
          future: [],
          selectedId: null,
        })
        persist(get())
      },

      setAi: (patch) =>
        set((s) => {
          const ai = { ...s.ai, ...patch }
          aiSettingsRepository.save(ai)
          return { ai }
        }),

      newProject: (name = '새 프로젝트') => {
        const proj = projectService.createBlank(name, get().customProducts)
        const id = proj.id ?? uid()
        set({
          projectId: id,
          projectName: proj.name,
          projectOrigin: proj.origin,
          plan: proj.plan,
          placements: [],
          floorPlanReview: undefined,
          selectedId: null,
          moving: null,
          mode: '2d', // 빈 도면은 2D 그리기부터 시작
          past: [],
          future: [],
          projects: projectService.list(),
        })
      },

      openProject: (id) => {
        const p = projectService.load(id)
        if (!p) {
          get().showToast('프로젝트를 불러올 수 없습니다', 'error')
          return
        }
        set({
          projectId: id,
          projectName: p.name,
          projectOrigin: p.origin,
          projects: projectService.list(),
          plan: p.plan,
          placements: p.placements,
          customProducts: p.customProducts ?? [],
          floorPlanReview: p.floorPlanReview,
          selectedId: null,
          moving: null,
          past: [],
          future: [],
          mode: floorPlanReviewBlocks3d(p.origin, p.floorPlanReview) ? '2d' : get().mode,
        })
        get().showToast(`'${p.name}' 열림`, 'info')
      },

      deleteProject: (id) => {
        projectService.delete(id)
        const st = get()
        if (id === st.projectId) {
          const rest = projectService.list()
          if (rest.length > 0) st.openProject(rest[0].id)
          else st.newProject()
        } else {
          set({ projects: projectService.list() })
        }
        get().showToast('프로젝트 삭제됨', 'info')
      },

      refreshProjects: () => set({ projects: projectService.list() }),
    }
  })

  return store
}
