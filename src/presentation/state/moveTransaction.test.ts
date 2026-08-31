import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product, Project } from '../../domain/model'
import type { AiSettings } from '../../application/aiSettings'
import type {
  AiSettingsRepository,
  Clock,
  IdGenerator,
  ProductCatalog,
  ProjectMeta,
} from '../../application/ports'
import type { ProjectService, ProjectSnapshot } from '../../application/projectService'
import { createAppStore, type AppStore } from './store'

const PROJECT: Project = {
  version: 1,
  id: 'project-1',
  name: '이동 transaction 테스트',
  plan: {
    unit: 'mm',
    wallHeight: 2400,
    walls: [],
    openings: [],
    rooms: [
      {
        id: 'room-1',
        name: '거실',
        polygon: [
          { x: 0, y: 0 },
          { x: 10_000, y: 0 },
          { x: 10_000, y: 10_000 },
          { x: 0, y: 10_000 },
        ],
      },
    ],
  },
  placements: [
    {
      id: 'placement-1',
      productId: 'p-tv-wall',
      pos: { x: 2000, y: 900, z: 2000 },
      rotY: 90,
      roomId: 'room-1',
    },
  ],
  customProducts: [],
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
}

const AI_SETTINGS: AiSettings = {
  baseUrl: 'https://example.test/v1',
  apiKey: '',
  model: 'test-model',
}

const PRODUCT: Product = {
  id: 'p-tv-wall',
  name: '벽걸이 TV',
  category: 'appliance',
  dims: { w: 1670, d: 90, h: 970 },
  mount: 'wall-mount',
  shape: 'tvWall',
}

function cloneProject(): Project {
  return JSON.parse(JSON.stringify(PROJECT)) as Project
}

function createStore(): AppStore {
  const metadata = (): ProjectMeta[] => [
    {
      id: PROJECT.id!,
      name: PROJECT.name,
      createdAt: PROJECT.createdAt,
      updatedAt: PROJECT.updatedAt,
    },
  ]
  const projectService: ProjectService = {
    initialize: cloneProject,
    starter: () => cloneProject(),
    list: metadata,
    save: vi.fn((_snapshot: ProjectSnapshot) => undefined),
    importProject: (project) => project,
    createBlank: cloneProject,
    load: () => cloneProject(),
    delete: vi.fn(),
  }
  const ids: IdGenerator = { next: () => 'generated-id' }
  const clock: Clock = { now: () => '2026-08-28T00:00:00.000Z' }
  const aiSettingsRepository: AiSettingsRepository = {
    load: () => AI_SETTINGS,
    save: vi.fn(),
  }
  const productCatalog: ProductCatalog = {
    list: () => [PRODUCT],
    findById: (id) => (id === PRODUCT.id ? PRODUCT : undefined),
  }
  return createAppStore({
    projectService,
    ids,
    clock,
    aiSettingsRepository,
    defaultAiSettings: AI_SETTINGS,
    productCatalog,
    autoSave: { schedule: () => undefined, cancel: () => undefined },
  })
}

describe('배치 이동 transaction history', () => {
  let store: AppStore

  beforeEach(() => {
    store = createStore()
  })

  const state = () => store.getState()
  const placement = () => state().placements.find((item) => item.id === 'placement-1')!
  const begin = () => {
    const current = placement()
    state().beginMove(current.id, {
      x: current.pos.x,
      z: current.pos.z,
      rotY: current.rotY,
      roomId: current.roomId,
    })
  }

  it('임시 이동을 확정한 후 undo하면 이동 전 원위치로 복원된다', () => {
    begin()
    state().movePlacement('placement-1', 4000, 3500, 'room-1')
    state().confirmMove()

    expect(state().past).toHaveLength(1)
    expect(placement().pos).toMatchObject({ x: 4000, z: 3500 })

    state().undo()

    expect(placement()).toMatchObject({
      pos: { x: 2000, y: 900, z: 2000 },
      rotY: 90,
      roomId: 'room-1',
    })
  })

  it('임시 이동을 취소하면 원위치로 복원하고 history를 추가하지 않는다', () => {
    begin()
    state().movePlacement('placement-1', 4000, 3500, 'room-1')
    state().cancelMove()

    expect(state().past).toHaveLength(0)
    expect(placement()).toMatchObject({
      pos: { x: 2000, y: 900, z: 2000 },
      rotY: 90,
      roomId: 'room-1',
    })
  })

  it('배치할 수 없는 위치의 이동 확정은 원위치로 복원하고 history를 추가하지 않는다', () => {
    begin()
    state().movePlacement('placement-1', -10_000, -10_000)
    state().confirmMove()

    expect(state().past).toHaveLength(0)
    expect(placement()).toMatchObject({
      pos: { x: 2000, y: 900, z: 2000 },
      rotY: 90,
      roomId: 'room-1',
    })
  })
})
