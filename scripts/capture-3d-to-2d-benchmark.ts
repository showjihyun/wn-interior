import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type Page } from '@playwright/test'

import type { FloorPlan, Opening, Pt, Room } from '../src/domain/model'
import { SAMPLE_PLAN } from '../src/infrastructure/reference-data/data/samplePlan'

const APP_URL = process.env.HOMEPLAN_DEMO_URL ?? 'http://127.0.0.1:5173'
const OUTPUT_ROOT = resolve('output/imagegen/3d-to-2d-benchmark')

interface WallSpec {
  id: string
  a: Pt
  b: Pt
  exterior?: boolean
}

interface CaseSpec {
  id: string
  label: string
  plan: FloorPlan
}

const p = (x: number, y: number): Pt => ({ x, y })
const rect = (id: string, name: string, x1: number, y1: number, x2: number, y2: number): Room => ({
  id,
  name,
  polygon: [p(x1, y1), p(x2, y1), p(x2, y2), p(x1, y2)],
  floorMaterialId: 'f-vinyl-oak',
  wallMaterialId: 'w-silk-white',
})

function wall(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  exterior = false
): WallSpec {
  return { id, a: p(x1, y1), b: p(x2, y2), exterior }
}

function openingFor(spec: WallSpec, index: number): Opening | null {
  const length = Math.hypot(spec.b.x - spec.a.x, spec.b.y - spec.a.y)
  if (length < 1500) return null
  const isEntry = spec.exterior && index === 0
  const type = isEntry ? 'entry' : spec.exterior ? 'window' : 'door'
  const width = isEntry ? 1000 : type === 'window' ? Math.min(1800, length * 0.42) : 820
  return {
    id: `o-${spec.id}`,
    wallId: spec.id,
    type,
    offset: Math.max(250, (length - width) / 2),
    width,
    height: type === 'window' ? 1400 : 2050,
    sill: type === 'window' ? 850 : 0,
  }
}

function makePlan(walls: WallSpec[], rooms: Room[], wallHeight = 2400): FloorPlan {
  const exteriorWalls = walls.filter((item) => item.exterior)
  const interiorWalls = walls.filter((item) => !item.exterior)
  const openingWalls = [exteriorWalls.at(-1), exteriorWalls[0], ...interiorWalls].filter(
    (item): item is WallSpec => !!item
  )
  return {
    unit: 'mm',
    wallHeight,
    walls: walls.map(({ exterior, ...item }) => ({
      ...item,
      thickness: exterior ? 200 : 120,
    })),
    openings: openingWalls
      .map((item, index) => openingFor(item, index))
      .filter((item): item is Opening => !!item),
    rooms,
  }
}

function outer(width: number, height: number): WallSpec[] {
  return [
    wall('north', 0, 0, width, 0, true),
    wall('east', width, 0, width, height, true),
    wall('south', width, height, 0, height, true),
    wall('west', 0, height, 0, 0, true),
  ]
}

const cases: CaseSpec[] = [
  {
    id: 'case-01-studio',
    label: 'single room studio',
    plan: makePlan(outer(8000, 6000), [rect('r1', 'Studio', 0, 0, 8000, 6000)]),
  },
  {
    id: 'case-02-dual-vertical',
    label: 'two rooms divided vertically',
    plan: makePlan(
      [...outer(9000, 6000), wall('i1', 4300, 0, 4300, 6000)],
      [rect('r1', 'West', 0, 0, 4300, 6000), rect('r2', 'East', 4300, 0, 9000, 6000)]
    ),
  },
  {
    id: 'case-03-dual-horizontal',
    label: 'two rooms divided horizontally',
    plan: makePlan(
      [...outer(10000, 6500), wall('i1', 0, 3300, 10000, 3300)],
      [rect('r1', 'North', 0, 0, 10000, 3300), rect('r2', 'South', 0, 3300, 10000, 6500)]
    ),
  },
  {
    id: 'case-04-three-bays',
    label: 'three parallel bays',
    plan: makePlan(
      [...outer(11000, 7000), wall('i1', 3600, 0, 3600, 7000), wall('i2', 7400, 0, 7400, 7000)],
      [
        rect('r1', 'Bay A', 0, 0, 3600, 7000),
        rect('r2', 'Bay B', 3600, 0, 7400, 7000),
        rect('r3', 'Bay C', 7400, 0, 11000, 7000),
      ]
    ),
  },
  {
    id: 'case-05-four-grid',
    label: 'four-room grid',
    plan: makePlan(
      [...outer(10000, 8000), wall('i1', 5000, 0, 5000, 8000), wall('i2', 0, 4000, 10000, 4000)],
      [
        rect('r1', 'NW', 0, 0, 5000, 4000),
        rect('r2', 'NE', 5000, 0, 10000, 4000),
        rect('r3', 'SW', 0, 4000, 5000, 8000),
        rect('r4', 'SE', 5000, 4000, 10000, 8000),
      ]
    ),
  },
  {
    id: 'case-06-corridor-six',
    label: 'six spaces around a corridor',
    plan: makePlan(
      [
        ...outer(12000, 8000),
        wall('i1', 0, 3000, 12000, 3000),
        wall('i2', 0, 5000, 12000, 5000),
        wall('i3', 4000, 0, 4000, 3000),
        wall('i4', 8000, 0, 8000, 3000),
        wall('i5', 6000, 5000, 6000, 8000),
      ],
      [
        rect('r1', 'N1', 0, 0, 4000, 3000),
        rect('r2', 'N2', 4000, 0, 8000, 3000),
        rect('r3', 'N3', 8000, 0, 12000, 3000),
        rect('r4', 'Corridor', 0, 3000, 12000, 5000),
        rect('r5', 'S1', 0, 5000, 6000, 8000),
        rect('r6', 'S2', 6000, 5000, 12000, 8000),
      ]
    ),
  },
  {
    id: 'case-07-l-shape',
    label: 'L-shaped exterior',
    plan: makePlan(
      [
        wall('north', 0, 0, 10000, 0, true),
        wall('east-a', 10000, 0, 10000, 4000, true),
        wall('notch-h', 10000, 4000, 6500, 4000, true),
        wall('notch-v', 6500, 4000, 6500, 8000, true),
        wall('south', 6500, 8000, 0, 8000, true),
        wall('west', 0, 8000, 0, 0, true),
        wall('i1', 3500, 0, 3500, 8000),
        wall('i2', 3500, 4000, 6500, 4000),
        wall('i3', 6500, 0, 6500, 4000),
      ],
      [
        rect('r1', 'West', 0, 0, 3500, 8000),
        rect('r2', 'Center North', 3500, 0, 6500, 4000),
        rect('r3', 'Center South', 3500, 4000, 6500, 8000),
        rect('r4', 'East', 6500, 0, 10000, 4000),
      ]
    ),
  },
  {
    id: 'case-08-long-five',
    label: 'five-room long plan',
    plan: makePlan(
      [
        ...outer(14000, 5000),
        wall('i1', 2800, 0, 2800, 5000),
        wall('i2', 5600, 0, 5600, 5000),
        wall('i3', 8400, 0, 8400, 5000),
        wall('i4', 11200, 0, 11200, 5000),
      ],
      [0, 1, 2, 3, 4].map((index) =>
        rect(`r${index + 1}`, `Room ${index + 1}`, index * 2800, 0, (index + 1) * 2800, 5000)
      )
    ),
  },
  {
    id: 'case-09-central-spine',
    label: 'central spine with four side rooms',
    plan: makePlan(
      [
        ...outer(11000, 9000),
        wall('i1', 4500, 0, 4500, 9000),
        wall('i2', 6500, 0, 6500, 9000),
        wall('i3', 0, 4500, 4500, 4500),
        wall('i4', 6500, 4500, 11000, 4500),
      ],
      [
        rect('r1', 'NW', 0, 0, 4500, 4500),
        rect('r2', 'SW', 0, 4500, 4500, 9000),
        rect('r3', 'Spine', 4500, 0, 6500, 9000),
        rect('r4', 'NE', 6500, 0, 11000, 4500),
        rect('r5', 'SE', 6500, 4500, 11000, 9000),
      ]
    ),
  },
  {
    id: 'case-10-apartment',
    label: 'sample apartment with mixed room sizes',
    plan: structuredClone(SAMPLE_PLAN),
  },
]

async function waitForFrames(page: Page, count = 3) {
  await page.waitForTimeout(count * 50)
}

async function setPlan(page: Page, plan: FloorPlan) {
  await page.evaluate((nextPlan) => {
    window.__hp3d_store.setState({
      plan: nextPlan,
      placements: [],
      customProducts: [],
      floorPlanReview: undefined,
      projectOrigin: 'blank',
      selectedId: null,
      pendingProductId: null,
      showDims3D: false,
      mode: '2d',
    })
  }, plan)
  await waitForFrames(page)
}

async function setOppositeIso(page: Page, plan: FloorPlan) {
  const xs = plan.walls.flatMap((item) => [item.a.x, item.b.x])
  const ys = plan.walls.flatMap((item) => [item.a.y, item.b.y])
  const center = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  }
  await page.evaluate(({ x, y }) => {
    const camera = window.__hp3d_cam
    if (!camera) throw new Error('camera unavailable')
    camera.position.set(x + 9000, 9500, y - 11000)
    camera.lookAt(x, 400, y)
    camera.updateProjectionMatrix()
  }, center)
  await waitForFrames(page, 5)
}

async function main() {
  const response = await fetch(APP_URL)
  if (!response.ok) throw new Error(`Start the app first: ${APP_URL}`)
  await mkdir(resolve(OUTPUT_ROOT, 'cases'), { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(APP_URL)
  await page.waitForFunction(() => !!window.__hp3d_store)

  try {
    for (const item of cases) {
      const caseDir = resolve(OUTPUT_ROOT, 'cases', item.id)
      await mkdir(caseDir, { recursive: true })
      await setPlan(page, item.plan)

      const svg = page.locator('.viewport svg')
      await svg.waitFor()
      await svg.screenshot({ path: resolve(caseDir, 'ground-truth-2d.png') })

      await page.evaluate(() => window.__hp3d_store.setState({ mode: '3d', viewPreset: 'top' }))
      const canvas = page.locator('.viewport canvas')
      await canvas.waitFor()
      await page.waitForFunction(() => !!window.__hp3d_cam)
      await waitForFrames(page, 8)
      await canvas.screenshot({ path: resolve(caseDir, 'input-top.png') })

      await page.evaluate(() => window.__hp3d_store.setState({ viewPreset: 'iso' }))
      await waitForFrames(page, 8)
      await canvas.screenshot({ path: resolve(caseDir, 'input-iso-a.png') })

      await setOppositeIso(page, item.plan)
      await canvas.screenshot({ path: resolve(caseDir, 'input-iso-b.png') })

      await writeFile(
        resolve(caseDir, 'project.json'),
        JSON.stringify({ id: item.id, label: item.label, plan: item.plan }, null, 2),
        'utf8'
      )
      console.log(
        `${item.id}: ${item.plan.rooms.length} rooms, ${item.plan.walls.length} walls, ${item.plan.openings.length} openings`
      )
    }
    await writeFile(
      resolve(OUTPUT_ROOT, 'manifest.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          condition: 'structural-no-furniture',
          views: ['top', 'iso-a', 'iso-b'],
          cases: cases.map(({ id, label, plan }) => ({
            id,
            label,
            rooms: plan.rooms.length,
            walls: plan.walls.length,
            openings: plan.openings.length,
          })),
        },
        null,
        2
      ),
      'utf8'
    )
  } finally {
    await context.close()
    await browser.close()
  }
}

await main()
