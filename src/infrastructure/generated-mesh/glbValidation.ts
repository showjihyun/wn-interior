export type GlbValidationResult =
  { ok: true; warnings: string[] } | { ok: false; reasons: string[] }

export interface GlbMeshInspectionReport {
  bounds: { w: number; d: number; h: number }
  vertices: number
  triangles: number
}

export type GlbMeshInspectionResult =
  { ok: true; report: GlbMeshInspectionReport } | { ok: false; reasons: string[] }

export function validateGlbContainer(_bytes: Uint8Array): GlbValidationResult {
  const bytes = _bytes
  if (bytes.byteLength < 20) return { ok: false, reasons: ['invalid-glb-header'] }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67) {
    return { ok: false, reasons: ['invalid-glb-magic'] }
  }
  if (view.getUint32(4, true) !== 2) return { ok: false, reasons: ['unsupported-glb-version'] }
  if (view.getUint32(8, true) !== bytes.byteLength) {
    return { ok: false, reasons: ['invalid-glb-length'] }
  }

  const jsonLength = view.getUint32(12, true)
  const jsonType = view.getUint32(16, true)
  if (jsonType !== 0x4e4f534a || jsonLength <= 0 || 20 + jsonLength > bytes.byteLength) {
    return { ok: false, reasons: ['invalid-json-chunk'] }
  }

  let document: GlbDocument
  try {
    const json = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim()
    document = JSON.parse(json) as GlbDocument
  } catch {
    return { ok: false, reasons: ['invalid-gltf-json'] }
  }
  if (document.asset?.version !== '2.0') {
    return { ok: false, reasons: ['unsupported-gltf-version'] }
  }

  const reasons: string[] = []
  if (document.buffers?.some((buffer) => typeof buffer.uri === 'string')) {
    reasons.push('external-buffer-uri')
  }
  if (document.images?.some((image) => typeof image.uri === 'string')) {
    reasons.push('external-image-uri')
  }
  if (document.animations?.length) reasons.push('animations-not-allowed')
  if (document.skins?.length) reasons.push('skins-not-allowed')
  if (document.cameras?.length) reasons.push('cameras-not-allowed')
  if (reasons.length > 0) return { ok: false, reasons }
  return { ok: true, warnings: [] }
}

export function inspectGlbMesh(_bytes: Uint8Array): GlbMeshInspectionResult {
  const container = validateGlbContainer(_bytes)
  if (!container.ok) return container
  const parsed = parseGlb(_bytes)
  if (!parsed || !parsed.binary) return { ok: false, reasons: ['binary-chunk-required'] }
  const { document, binary } = parsed
  const reasons: string[] = []
  if (
    document.nodes?.some((node) => node.matrix || node.translation || node.rotation || node.scale)
  ) {
    reasons.push('node-transform-not-canonical')
  }
  for (const bufferView of document.bufferViews ?? []) {
    const start = bufferView.byteOffset ?? 0
    if (
      bufferView.buffer !== 0 ||
      start < 0 ||
      bufferView.byteLength <= 0 ||
      start + bufferView.byteLength > binary.byteLength
    ) {
      reasons.push('buffer-view-out-of-range')
      break
    }
  }
  if (reasons.length > 0) return { ok: false, reasons }

  let vertices = 0
  let triangles = 0
  const minimum = {
    x: Number.POSITIVE_INFINITY,
    y: Number.POSITIVE_INFINITY,
    z: Number.POSITIVE_INFINITY,
  }
  const maximum = {
    x: Number.NEGATIVE_INFINITY,
    y: Number.NEGATIVE_INFINITY,
    z: Number.NEGATIVE_INFINITY,
  }
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.mode !== undefined && primitive.mode !== 4) {
        reasons.push('primitive-mode-not-triangles')
        continue
      }
      const positionIndex = primitive.attributes?.POSITION
      const position = positionIndex === undefined ? undefined : document.accessors?.[positionIndex]
      if (
        !position ||
        position.componentType !== 5126 ||
        position.type !== 'VEC3' ||
        !Number.isInteger(position.count) ||
        position.count <= 0 ||
        position.sparse
      ) {
        reasons.push('position-accessor-invalid')
        continue
      }
      const positionView = document.bufferViews?.[position.bufferView]
      if (!positionView) {
        reasons.push('position-buffer-view-missing')
        continue
      }
      const stride = positionView.byteStride ?? 12
      const positionOffset = (positionView.byteOffset ?? 0) + (position.byteOffset ?? 0)
      const lastPositionByte = positionOffset + (position.count - 1) * stride + 12
      if (
        stride < 12 ||
        lastPositionByte > (positionView.byteOffset ?? 0) + positionView.byteLength
      ) {
        reasons.push('position-accessor-out-of-range')
        continue
      }
      const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength)
      for (let index = 0; index < position.count; index++) {
        const offset = positionOffset + index * stride
        const x = view.getFloat32(offset, true)
        const y = view.getFloat32(offset + 4, true)
        const z = view.getFloat32(offset + 8, true)
        if (![x, y, z].every(Number.isFinite)) {
          reasons.push('non-finite-position')
          break
        }
        minimum.x = Math.min(minimum.x, x)
        minimum.y = Math.min(minimum.y, y)
        minimum.z = Math.min(minimum.z, z)
        maximum.x = Math.max(maximum.x, x)
        maximum.y = Math.max(maximum.y, y)
        maximum.z = Math.max(maximum.z, z)
      }
      vertices += position.count

      if (primitive.indices === undefined) {
        if (position.count % 3 !== 0) reasons.push('triangle-count-invalid')
        else triangles += position.count / 3
        continue
      }
      const indices = document.accessors?.[primitive.indices]
      const indexView = indices ? document.bufferViews?.[indices.bufferView] : undefined
      const componentBytes = indices ? indexComponentBytes(indices.componentType) : 0
      if (
        !indices ||
        !indexView ||
        indices.type !== 'SCALAR' ||
        !componentBytes ||
        indices.count <= 0 ||
        indices.count % 3 !== 0 ||
        indices.sparse
      ) {
        reasons.push('index-accessor-invalid')
        continue
      }
      const indexStride = indexView.byteStride ?? componentBytes
      const indexOffset = (indexView.byteOffset ?? 0) + (indices.byteOffset ?? 0)
      const lastIndexByte = indexOffset + (indices.count - 1) * indexStride + componentBytes
      if (lastIndexByte > (indexView.byteOffset ?? 0) + indexView.byteLength) {
        reasons.push('index-accessor-out-of-range')
        continue
      }
      for (let index = 0; index < indices.count; index++) {
        const value = readIndex(view, indexOffset + index * indexStride, indices.componentType)
        if (value >= position.count) {
          reasons.push('index-out-of-range')
          break
        }
      }
      triangles += indices.count / 3
    }
  }
  if (vertices === 0 || triangles === 0) reasons.push('mesh-geometry-missing')
  if (reasons.length > 0) return { ok: false, reasons: [...new Set(reasons)] }
  return {
    ok: true,
    report: {
      bounds: {
        w: maximum.x - minimum.x,
        d: maximum.z - minimum.z,
        h: maximum.y - minimum.y,
      },
      vertices,
      triangles,
    },
  }
}

function parseGlb(bytes: Uint8Array): { document: GlbDocument; binary?: Uint8Array } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  let document: GlbDocument | undefined
  let binary: Uint8Array | undefined
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + 8
    const end = start + length
    if (length <= 0 || end > bytes.byteLength) return null
    if (type === 0x4e4f534a) {
      try {
        document = JSON.parse(
          new TextDecoder().decode(bytes.subarray(start, end)).trim()
        ) as GlbDocument
      } catch {
        return null
      }
    } else if (type === 0x004e4942) {
      binary = bytes.subarray(start, end)
    }
    offset = end
  }
  return document ? { document, binary } : null
}

function indexComponentBytes(componentType: number): number {
  if (componentType === 5121) return 1
  if (componentType === 5123) return 2
  if (componentType === 5125) return 4
  return 0
}

function readIndex(view: DataView, offset: number, componentType: number): number {
  if (componentType === 5121) return view.getUint8(offset)
  if (componentType === 5123) return view.getUint16(offset, true)
  return view.getUint32(offset, true)
}

interface GlbDocument {
  asset?: { version?: string }
  buffers?: Array<{ uri?: string }>
  images?: Array<{ uri?: string }>
  animations?: unknown[]
  skins?: unknown[]
  cameras?: unknown[]
  bufferViews?: Array<{
    buffer: number
    byteOffset?: number
    byteLength: number
    byteStride?: number
  }>
  accessors?: Array<{
    bufferView: number
    byteOffset?: number
    componentType: number
    count: number
    type: string
    sparse?: unknown
  }>
  meshes?: Array<{
    primitives?: Array<{
      attributes?: { POSITION?: number }
      indices?: number
      mode?: number
    }>
  }>
  nodes?: Array<{
    mesh?: number
    matrix?: number[]
    translation?: number[]
    rotation?: number[]
    scale?: number[]
  }>
}
