// ─────────────────────────────────────────────────────────────
// 전역 상태 — 단일 소스 오브 트루스 (Project = plan + placements)
// Undo/Redo: 스냅샷 스택 / localStorage 자동저장(debounce)
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand'
import type {
  AiSettings,
  FloorPlan,
  Opening,
  Placement,
  Product,
  Project,
  Pt,
  Room,
  Wall,
} from '../types'
import { SAMPLE_PLACEMENTS, SAMPLE_PLAN } from '../data/samplePlan'
import { CATALOG, PRODUCT_MAP } from '../data/catalog'
import { canDropAt } from '../engine/drop'
import { resolveDims } from '../engine/dims'
import { storage, type ProjectMeta } from '../storage/storage'

const LS_KEY = 'homeplan3d.project.v1'

interface Snapshot {
  plan: FloorPlan
  placements: Placement[]
  customProducts: Product[]
}

/** 배치안 비교용 스냅샷 */
export interface Variant {
  id: string
  name: string
  thumb?: string
  placements: Placement[]
}

export interface AppState {
  projectName: string
  plan: FloorPlan
  placements: Placement[]
  customProducts: Product[]
  selectedId: string | null
  mode: '3d' | '2d'
  past: Snapshot[]
  future: Snapshot[]
  ai: AiSettings
  pendingProductId: string | null
  viewPreset: 'iso' | 'top' | 'walk'
  variants: Variant[]
  moving: { id: string; origin: { x: number; z: number; rotY: number } } | null
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
  saveVariant: (name: string, thumb?: string) => void
  applyVariant: (id: string) => void
  removeVariant: (id: string) => void
  beginMove: (id: string, origin: { x: number; z: number; rotY: number }) => void
  confirmMove: () => void
  cancelMove: () => void
  showToast: (msg: string, kind?: 'error' | 'warn' | 'info') => void

  commit: (fn: (s: AppState) => void) => void
  undo: () => void
  redo: () => void
  select: (id: string | null) => void
  setMode: (m: '3d' | '2d') => void

  addPlacement: (productId: string, pos: { x: number; z: number }, rotY?: number) => string | null
  updatePlacement: (id: string, patch: Partial<Placement>) => void
  movePlacement: (id: string, x: number, z: number, roomId?: string) => void
  removePlacement: (id: string) => void
  duplicatePlacement: (id: string) => void

  setRoomMaterial: (roomId: string, kind: 'floorMaterialId' | 'wallMaterialId', materialId: string) => void
  renameRoom: (roomId: string, name: string) => void

  addWall: (a: Pt, b: Pt, thickness?: number) => void
  updateWall: (wallId: string, patch: Partial<Wall>) => void
  removeWall: (wallId: string) => void
  addOpening: (op: Omit<Opening, 'id'>) => void
  updateOpening: (opId: string, patch: Partial<Opening>) => void
  removeOpening: (opId: string) => void
  setWallHeight: (h: number) => void

  addCustomProduct: (p: Omit<Product, 'id'>) => string
  loadProject: (p: Project) => void
  exportProject: () => Project
  resetToSample: () => void
  setAi: (patch: Partial<AiSettings>) => void

  productById: (id: string) => Product | undefined
}

const clonePlan = (p: FloorPlan): FloorPlan =>
  JSON.parse(JSON.stringify(p)) as FloorPlan
const clonePlacements = (ps: Placement[]): Placement[] =>
  ps.map((x) => ({ ...x, pos: { ...x.pos } }))

let saveTimer: ReturnType<typeof setTimeout> | null = null
function persist(s: AppState) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const existing = storage.load(s.projectId)
      const proj: Project = {
        version: 1,
        id: s.projectId,
        name: s.projectName,
        plan: s.plan,
        placements: s.placements,
        customProducts: s.customProducts,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      storage.save(proj)
    } catch {
      /* 저장 실패 무시 */
    }
  }, 600)
}

/** 저장소 초기화: 기존 단일 슬롯 마이그레이션 → 최근 프로젝트 → 샘플 신규 */
function initialProject(): Project {
  // 1) 구버전 단일 슬롯 마이그레이션
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Project
      if (p?.plan) {
        const id = Math.random().toString(36).slice(2, 10)
        const proj: Project = {
          ...p,
          id,
          placements: p.placements ?? [],
          customProducts: p.customProducts ?? [],
          createdAt: p.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        storage.save(proj)
        localStorage.removeItem(LS_KEY)
        return proj
      }
    }
  } catch {
    /* 마이그레이션 실패 시 폴백 */
  }
  // 2) 저장된 프로젝트 중 최근 항목
  const list = storage.list()
  if (list.length > 0) {
    const p = storage.load(list[0].id)
    if (p) return p
  }
  // 3) 샘플 프로젝트 신규 생성
  const id = Math.random().toString(36).slice(2, 10)
  const proj: Project = {
    version: 1,
    id,
    name: '샘플 아파트 (34평형)',
    plan: clonePlan(SAMPLE_PLAN),
    placements: SAMPLE_PLACEMENTS.map((sp) => ({
      id: Math.random().toString(36).slice(2, 10),
      productId: sp.productId,
      pos: { ...sp.pos },
      rotY: sp.rotY,
    })),
    customProducts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  storage.save(proj)
  return proj
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const init = initialProject()

export const useStore = create<AppState>((set, get) => ({
  projectName: init.name,
  projectId: init.id ?? 'current',
  projects: storage.list(),
  plan: init.plan,
  placements: init.placements,
  customProducts: init.customProducts,
  selectedId: null,
  mode: '3d',
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
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: (import.meta.env.VITE_OPENROUTER_KEY as string) ?? '',
    model: 'stealth/ox-alpha',
  },

  productById: (id) =>
    PRODUCT_MAP.get(id) ??
    get().customProducts.find((c) => c.id === id),

  commit: (fn) =>
    set((s) => {
      const next: AppState = {
        ...s,
        plan: clonePlan(s.plan),
        placements: clonePlacements(s.placements),
        customProducts: [...s.customProducts],
        moving: null, // 히스토리 연산은 이동 확정 대기 무효화
        past: [...s.past.slice(-59), { plan: s.plan, placements: s.placements, customProducts: s.customProducts }],
        future: [],
      }
      fn(next)
      persist(next)
      return next
    }),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1]
      if (!prev) return s
      const cur = { plan: s.plan, placements: s.placements, customProducts: s.customProducts }
      const next = {
        ...s,
        ...prev,
        moving: null,
        past: s.past.slice(0, -1),
        future: [cur, ...s.future.slice(0, 59)],
      }
      persist(next)
      return next
    }),

  redo: () =>
    set((s) => {
      const nxt = s.future[0]
      if (!nxt) return s
      const cur = { plan: s.plan, placements: s.placements, customProducts: s.customProducts }
      const next = {
        ...s,
        ...nxt,
        moving: null,
        past: [...s.past.slice(-59), cur],
        future: s.future.slice(1),
      }
      persist(next)
      return next
    }),

  select: (id) => set({ selectedId: id }),
  setMode: (m) => set({ mode: m }),
  setPending: (id) =>
    set((s) => ({ pendingProductId: id, selectedId: id === null ? s.selectedId : null })),
  setViewPreset: (v) => set({ viewPreset: v }),

  saveVariant: (name, thumb) =>
    set((s) => ({
      ...s,
      variants: [
        ...s.variants,
        {
          id: uid(),
          name: name || `배치안 ${s.variants.length + 1}`,
          thumb,
          placements: clonePlacements(s.placements),
        },
      ],
    })),

  applyVariant: (id) =>
    get().commit((s) => {
      const v = s.variants.find((x) => x.id === id)
      if (v) s.placements = clonePlacements(v.placements)
    }),

  removeVariant: (id) =>
    set((s) => ({ ...s, variants: s.variants.filter((v) => v.id !== id) })),

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
    const r = canDropAt(s.plan, effProduct, s.placements, mv.id, pl.pos.x, pl.pos.z, pl.rotY, s.productById)
    if (r.ok) {
      s.updatePlacement(mv.id, { pos: { ...pl.pos }, rotY: pl.rotY })
      set({ moving: null })
    } else {
      s.movePlacement(mv.id, mv.origin.x, mv.origin.z)
      s.updatePlacement(mv.id, { rotY: mv.origin.rotY })
      set({ moving: null })
      s.showToast('공간이 부족해 배치할 수 없어요')
    }
  },

  cancelMove: () => {
    const s = get()
    const mv = s.moving
    if (!mv) return
    s.movePlacement(mv.id, mv.origin.x, mv.origin.z)
    s.updatePlacement(mv.id, { rotY: mv.origin.rotY })
    set({ moving: null })
  },

  showToast: (msg, kind = 'warn') => {
    const tid = Date.now()
    set({ toast: { id: tid, msg, kind } })
    setTimeout(() => {
      if (get().toast?.id === tid) set({ toast: null })
    }, 2600)
  },

  addPlacement: (productId, pos, rotY = 0) => {
    const prod = get().productById(productId)
    if (!prod) return null
    const id = uid()
    get().commit((s) => {
      s.placements.push({
        id,
        productId,
        pos: { x: Math.round(pos.x), y: 0, z: Math.round(pos.z) },
        rotY,
        colorway: prod.colorways?.[0],
      })
    })
    set({ selectedId: id })
    return id
  },

  updatePlacement: (id, patch) =>
    get().commit((s) => {
      const i = s.placements.findIndex((p) => p.id === id)
      if (i >= 0) s.placements[i] = { ...s.placements[i], ...patch }
    }),

  movePlacement: (id, x, z, roomId) =>
    set((s) => ({
      ...s,
      placements: s.placements.map((p) =>
        p.id === id ? { ...p, pos: { ...p.pos, x: Math.round(x), z: Math.round(z) }, roomId } : p,
      ),
    })),

  removePlacement: (id) => {
    get().commit((s) => {
      s.placements = s.placements.filter((p) => p.id !== id)
    })
    if (get().selectedId === id) set({ selectedId: null })
  },
  duplicatePlacement: (id) => {
    const src = get().placements.find((p) => p.id === id)
    if (!src) return
    const nid = uid()
    get().commit((s) => {
      s.placements.push({
        ...src,
        id: nid,
        pos: { ...src.pos, x: src.pos.x + 300 },
      })
    })
    set({ selectedId: nid })
  },

  setRoomMaterial: (roomId, kind, materialId) =>
    get().commit((s) => {
      const r = s.plan.rooms.find((x) => x.id === roomId)
      if (r) r[kind] = materialId
    }),

  renameRoom: (roomId, name) =>
    get().commit((s) => {
      const r = s.plan.rooms.find((x) => x.id === roomId)
      if (r) r.name = name
    }),

  addWall: (a, b, thickness = 120) =>
    get().commit((s) => {
      s.plan.walls.push({ id: uid(), a, b, thickness })
    }),

  updateWall: (wallId, patch) =>
    get().commit((s) => {
      const w = s.plan.walls.find((x) => x.id === wallId)
      if (w) Object.assign(w, patch)
    }),

  removeWall: (wallId) =>
    get().commit((s) => {
      s.plan.walls = s.plan.walls.filter((w) => w.id !== wallId)
      s.plan.openings = s.plan.openings.filter((o) => o.wallId !== wallId)
    }),

  addOpening: (op) =>
    get().commit((s) => {
      s.plan.openings.push({ ...op, id: uid() })
    }),

  updateOpening: (opId, patch) =>
    get().commit((s) => {
      const o = s.plan.openings.find((x) => x.id === opId)
      if (o) Object.assign(o, patch)
    }),

  removeOpening: (opId) =>
    get().commit((s) => {
      s.plan.openings = s.plan.openings.filter((o) => o.id !== opId)
    }),

  setWallHeight: (h) =>
    get().commit((s) => {
      s.plan.wallHeight = h
    }),

  addCustomProduct: (p) => {
    const id = 'custom-' + uid()
    get().commit((s) => {
      s.customProducts.push({ ...p, id })
    })
    return id
  },

  loadProject: (p) => {
    set({
      projectName: p.name,
      plan: p.plan,
      placements: p.placements,
      customProducts: p.customProducts ?? [],
      past: [],
      future: [],
      selectedId: null,
    })
    persist(get())
  },

  exportProject: () => {
    const s = get()
    return {
      version: 1,
      name: s.projectName,
      plan: s.plan,
      placements: s.placements,
      customProducts: s.customProducts,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  },

  resetToSample: () => {
    set({
      projectName: '샘플 아파트 (34평형)',
      plan: clonePlan(SAMPLE_PLAN),
      placements: SAMPLE_PLACEMENTS.map((sp) => ({ id: uid(), productId: sp.productId, pos: { ...sp.pos }, rotY: sp.rotY })),
      customProducts: [],
      past: [],
      future: [],
      selectedId: null,
    })
    persist(get())
  },

  setAi: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),

  newProject: (name = '새 프로젝트') => {
    const id = uid()
    const proj: Project = {
      version: 1,
      id,
      name,
      plan: { unit: 'mm', wallHeight: 2400, walls: [], openings: [], rooms: [] },
      placements: [],
      customProducts: get().customProducts,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    storage.save(proj)
    set({
      projectId: id,
      projectName: proj.name,
      plan: proj.plan,
      placements: [],
      selectedId: null,
      moving: null,
      mode: '2d', // 빈 도면은 2D 그리기부터 시작
      past: [],
      future: [],
      projects: storage.list(),
    })
  },

  openProject: (id) => {
    const p = storage.load(id)
    if (!p) {
      get().showToast('프로젝트를 불러올 수 없습니다', 'error')
      return
    }
    set({
      projectId: id,
      projectName: p.name,
      plan: p.plan,
      placements: p.placements,
      customProducts: p.customProducts ?? [],
      selectedId: null,
      moving: null,
      past: [],
      future: [],
    })
    get().showToast(`'${p.name}' 열림`, 'info')
  },

  deleteProject: (id) => {
    storage.delete(id)
    const st = get()
    if (id === st.projectId) {
      const rest = storage.list()
      if (rest.length > 0) st.openProject(rest[0].id)
      else st.newProject()
    } else {
      set({ projects: storage.list() })
    }
    get().showToast('프로젝트 삭제됨', 'info')
  },

  refreshProjects: () => set({ projects: storage.list() }),
}))

export function allCatalog(): Product[] {
  return [...CATALOG, ...useStore.getState().customProducts]
}

// 테스트/디버그 훅스
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__hp3d_store = useStore
}
