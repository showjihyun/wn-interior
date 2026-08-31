import type { FloorPlan, FloorPlanReview, Placement, Product, Project } from '../domain/model'
import type {
  Clock,
  IdGenerator,
  LegacyProjectSource,
  ProjectMeta,
  ProjectRepository,
  StarterProjectProvider,
} from './ports'

export interface ProjectSnapshot {
  id: string
  name: string
  origin?: Project['origin']
  plan: FloorPlan
  placements: Placement[]
  customProducts: Product[]
  floorPlanReview?: FloorPlanReview
}

export interface ProjectService {
  initialize(): Project
  starter(): Omit<ProjectSnapshot, 'id'>
  list(): ProjectMeta[]
  save(snapshot: ProjectSnapshot): void
  importProject(project: Project): Project
  createBlank(name: string, customProducts: Product[]): Project
  load(id: string): Project | null
  delete(id: string): void
}

export interface ProjectServiceDependencies {
  repository: ProjectRepository
  legacySource: LegacyProjectSource
  ids: IdGenerator
  clock: Clock
  starterProjectProvider: StarterProjectProvider
}

const clonePlan = (plan: FloorPlan): FloorPlan => ({
  unit: plan.unit,
  wallHeight: plan.wallHeight,
  walls: plan.walls.map((wall) => ({
    ...wall,
    a: { ...wall.a },
    b: { ...wall.b },
  })),
  openings: plan.openings.map((opening) => ({ ...opening })),
  rooms: plan.rooms.map((room) => ({
    ...room,
    polygon: room.polygon.map((point) => ({ ...point })),
  })),
})

const cloneProduct = (product: Product): Product => ({
  ...product,
  dims: { ...product.dims },
  colorways: product.colorways ? [...product.colorways] : undefined,
  retail: product.retail
    ? {
        ...product.retail,
        included: [...product.retail.included],
        excluded: [...product.retail.excluded],
      }
    : undefined,
  appearance: product.appearance ? { ...product.appearance } : undefined,
  dimensionVariants: product.dimensionVariants?.map((variant) => ({
    ...variant,
    dims: { ...variant.dims },
  })),
  catalog: product.catalog
    ? {
        ...product.catalog,
        tags: [...product.catalog.tags],
        materials: [...product.catalog.materials],
        sourceImageUrls: [...product.catalog.sourceImageUrls],
        variants: product.catalog.variants.map((variant) => ({
          ...variant,
          dims: variant.dims ? { ...variant.dims } : undefined,
        })),
      }
    : undefined,
  installation: product.installation
    ? {
        provides: [...product.installation.provides],
        requires: product.installation.requires
          ? {
              ...product.installation.requires,
              allOf: product.installation.requires.allOf
                ? [...product.installation.requires.allOf]
                : undefined,
              anyOf: product.installation.requires.anyOf
                ? [...product.installation.requires.anyOf]
                : undefined,
            }
          : undefined,
        surface: product.installation.surface
          ? {
              ...product.installation.surface,
              supportedBy: [...product.installation.surface.supportedBy],
            }
          : undefined,
      }
    : undefined,
})

const cloneFloorPlanReview = (review?: FloorPlanReview): FloorPlanReview | undefined =>
  review
    ? {
        ...review,
        baselineTargetFingerprints: review.baselineTargetFingerprints
          ? { ...review.baselineTargetFingerprints }
          : undefined,
        evidence: review.evidence ? { ...review.evidence } : undefined,
      }
    : undefined

function starterPlacements(
  placements: Array<Omit<Placement, 'id'>>,
  ids: IdGenerator
): Placement[] {
  return placements.map((placement) => ({
    ...placement,
    id: ids.next(),
    pos: { ...placement.pos },
    dimsOverride: placement.dimsOverride ? { ...placement.dimsOverride } : undefined,
  }))
}

export function createProjectService({
  repository,
  legacySource,
  ids,
  clock,
  starterProjectProvider,
}: ProjectServiceDependencies): ProjectService {
  const starter = (): Omit<ProjectSnapshot, 'id'> => {
    const template = starterProjectProvider.getStarterProject()
    return {
      name: template.name,
      plan: clonePlan(template.plan),
      placements: starterPlacements(template.placements, ids),
      customProducts: template.customProducts.map(cloneProduct),
      floorPlanReview: undefined,
    }
  }
  const save = (snapshot: ProjectSnapshot) => {
    const existing = repository.load(snapshot.id)
    const now = clock.now()
    repository.save({
      version: 1,
      id: snapshot.id,
      name: snapshot.name,
      origin: snapshot.origin,
      plan: snapshot.plan,
      placements: snapshot.placements,
      customProducts: snapshot.customProducts,
      floorPlanReview: cloneFloorPlanReview(snapshot.floorPlanReview),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  }

  return {
    initialize() {
      const legacy = legacySource.load()
      if (legacy?.plan) {
        const now = clock.now()
        const migrated: Project = {
          ...legacy,
          version: 1,
          id: ids.next(),
          placements: legacy.placements ?? [],
          customProducts: legacy.customProducts ?? [],
          createdAt: legacy.createdAt ?? now,
          updatedAt: now,
        }
        repository.save(migrated)
        legacySource.remove()
        return migrated
      }

      const recent = [...repository.list()].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      )[0]
      if (recent) {
        const project = repository.load(recent.id)
        if (project) return project
      }

      const now = clock.now()
      const id = ids.next()
      const initial = starter()
      const project: Project = {
        version: 1,
        id,
        ...initial,
        origin: 'sample',
        createdAt: now,
        updatedAt: now,
      }
      repository.save(project)
      return project
    },

    starter,
    list: () => repository.list(),
    save,

    importProject(project) {
      const now = clock.now()
      const id = ids.next()
      const imported: Project = {
        ...project,
        version: 1,
        id,
        origin: project.origin ?? 'import',
        customProducts: project.customProducts ?? [],
        createdAt: project.createdAt || now,
        updatedAt: now,
      }
      repository.save(imported)
      return imported
    },

    createBlank(name, customProducts) {
      const now = clock.now()
      const project: Project = {
        version: 1,
        id: ids.next(),
        name,
        origin: 'blank',
        plan: { unit: 'mm', wallHeight: 2400, walls: [], openings: [], rooms: [] },
        placements: [],
        customProducts,
        createdAt: now,
        updatedAt: now,
      }
      repository.save(project)
      return project
    },

    load: (id) => repository.load(id),
    delete: (id) => repository.delete(id),
  }
}
