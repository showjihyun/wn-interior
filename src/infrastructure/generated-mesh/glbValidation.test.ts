import { describe, expect, it } from 'vitest'
import { inspectGlbMesh, validateGlbContainer } from './glbValidation'

const encoder = new TextEncoder()

function glb(json: Record<string, unknown>): Uint8Array {
  const source = encoder.encode(JSON.stringify(json))
  const paddedLength = Math.ceil(source.length / 4) * 4
  const bytes = new Uint8Array(12 + 8 + paddedLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.byteLength, true)
  view.setUint32(12, paddedLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(0x20, 20)
  bytes.set(source, 20)
  return bytes
}

function triangleGlb(
  options: { translated?: boolean; invalidBufferView?: boolean } = {}
): Uint8Array {
  const positions = new Float32Array([-1, 0, -0.5, 1, 0, -0.5, 0, 2, 0.5])
  const indices = new Uint16Array([0, 1, 2])
  const binary = new Uint8Array(44)
  binary.set(new Uint8Array(positions.buffer), 0)
  binary.set(new Uint8Array(indices.buffer), 36)
  return glbWithBinary(
    {
      asset: { version: '2.0' },
      buffers: [{ byteLength: binary.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: options.invalidBufferView ? 999 : 36 },
        { buffer: 0, byteOffset: 36, byteLength: 6 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [0, 0, 0],
        },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
      nodes: [{ mesh: 0, ...(options.translated ? { translation: [1, 0, 0] } : {}) }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    },
    binary
  )
}

function glbWithBinary(json: Record<string, unknown>, binary: Uint8Array): Uint8Array {
  const source = encoder.encode(JSON.stringify(json))
  const jsonLength = Math.ceil(source.length / 4) * 4
  const binaryLength = Math.ceil(binary.length / 4) * 4
  const bytes = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.byteLength, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(0x20, 20, 20 + jsonLength)
  bytes.set(source, 20)
  const binaryHeader = 20 + jsonLength
  view.setUint32(binaryHeader, binaryLength, true)
  view.setUint32(binaryHeader + 4, 0x004e4942, true)
  bytes.set(binary, binaryHeader + 8)
  return bytes
}

describe('승인 GLB 컨테이너 검증', () => {
  it('내장 리소스만 사용하는 glTF 2.0 GLB를 허용한다', () => {
    const result = validateGlbContainer(
      glb({ asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [] })
    )

    expect(result).toEqual({ ok: true, warnings: [] })
  })

  it('손상 헤더와 외부 URI 리소스를 배포 자산에서 거절한다', () => {
    const corrupt = glb({ asset: { version: '2.0' } })
    corrupt[0] = 0
    expect(validateGlbContainer(corrupt)).toEqual({ ok: false, reasons: ['invalid-glb-magic'] })

    const external = validateGlbContainer(
      glb({
        asset: { version: '2.0' },
        buffers: [{ uri: 'https://tracker.example/mesh.bin' }],
        images: [{ uri: 'texture.png' }],
      })
    )
    expect(external).toEqual({
      ok: false,
      reasons: expect.arrayContaining(['external-buffer-uri', 'external-image-uri']),
    })
  })

  it('manifest min/max가 아니라 실제 POSITION·index binary에서 bounds와 triangle을 계산한다', () => {
    expect(inspectGlbMesh(triangleGlb())).toEqual({
      ok: true,
      report: {
        bounds: { w: 2, d: 1, h: 2 },
        vertices: 3,
        triangles: 1,
      },
    })
  })

  it('canonical 좌표를 깨는 node transform과 buffer 범위 초과를 거절한다', () => {
    expect(inspectGlbMesh(triangleGlb({ translated: true }))).toEqual({
      ok: false,
      reasons: expect.arrayContaining(['node-transform-not-canonical']),
    })
    expect(inspectGlbMesh(triangleGlb({ invalidBufferView: true }))).toEqual({
      ok: false,
      reasons: expect.arrayContaining(['buffer-view-out-of-range']),
    })
  })
})
