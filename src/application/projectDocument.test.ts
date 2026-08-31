import { describe, expect, it } from 'vitest'
import { exportProjectDocument, importProjectDocument } from './projectDocument'

const project = {
  version: 1 as const,
  name: '우리집',
  plan: { unit: 'mm' as const, wallHeight: 2400, walls: [], openings: [], rooms: [] },
  placements: [],
  customProducts: [],
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
}

describe('project document', () => {
  it('내보낸 문서를 다시 가져올 수 있다', () => {
    expect(importProjectDocument(exportProjectDocument(project))).toEqual(project)
  })

  it('스키마가 아닌 JSON은 차단한다', () => {
    expect(() => importProjectDocument('{"name":"broken"}')).toThrow('invalid-project-document')
  })

  it('확장형 제품의 dimsOverride를 export/import 왕복 보존한다', () => {
    const expanded = {
      ...project,
      placements: [
        {
          id: 'norden-1',
          productId: 'ik-norden-table',
          pos: { x: 1000, y: 0, z: 1000 },
          rotY: 0,
          dimsOverride: { w: 1520, d: 800, h: 740 },
        },
      ],
    }

    expect(
      importProjectDocument(exportProjectDocument(expanded)).placements[0].dimsOverride
    ).toEqual({ w: 1520, d: 800, h: 740 })
  })

  it('평면도·마감재·배치 회전·색상·Attach 관계와 커스텀 제품을 모두 보존한다', () => {
    const complete = {
      ...project,
      plan: {
        unit: 'mm' as const,
        wallHeight: 2600,
        walls: [
          {
            id: 'wall-1',
            a: { x: 0, y: 0 },
            b: { x: 5000, y: 0 },
            thickness: 180,
          },
        ],
        openings: [
          {
            id: 'door-1',
            wallId: 'wall-1',
            type: 'door' as const,
            offset: 1200,
            width: 900,
            height: 2100,
            sill: 0,
          },
        ],
        rooms: [
          {
            id: 'kitchen',
            name: '주방',
            polygon: [
              { x: 0, y: 0 },
              { x: 5000, y: 0 },
              { x: 5000, y: 4000 },
              { x: 0, y: 4000 },
            ],
            floorMaterialId: 'f-wood-natural',
            wallMaterialId: 'w-silk-white',
          },
        ],
      },
      placements: [
        {
          id: 'cabinet-1',
          productId: 'custom-cabinet',
          roomId: 'kitchen',
          pos: { x: 2000, y: 0, z: 1000 },
          rotY: 90,
          colorway: '#ffffff',
        },
        {
          id: 'faucet-1',
          productId: 'custom-faucet',
          roomId: 'kitchen',
          pos: { x: 2000, y: 850, z: 800 },
          rotY: 105,
          elevationOverride: 850,
          supportPlacementId: 'cabinet-1',
          dimsOverride: { w: 240, d: 280, h: 370 },
        },
      ],
      customProducts: [
        {
          id: 'custom-cabinet',
          name: '맞춤 하부장',
          category: 'custom' as const,
          dims: { w: 1200, d: 600, h: 850 },
          mount: 'floor' as const,
          shape: 'sinkLower' as const,
        },
      ],
    }

    expect(importProjectDocument(exportProjectDocument(complete))).toEqual(complete)
  })
})
