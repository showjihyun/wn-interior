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
})
