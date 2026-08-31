import { createHash } from 'node:crypto'

interface FixtureProduct {
  id: string
  name: string
  category: 'living'
  dims: { w: number; d: number; h: number }
  mount: 'floor'
  shape: 'box'
  appearance: {
    textureUrl: string
    imageSourceUrl: string
    sha256: string
    projection: 'front'
    removeWhiteBackground: false
  }
}

interface FixturePublishedMesh {
  assetId: string
  productId: string
  productFingerprint: string
  uri: string
  sha256: string
  byteLength: number
  publishedAt: string
  generatorLabel: string
  visualOnly: true
}

export interface GeneratedMeshE2EFixture {
  product: FixtureProduct
  manifest: { schemaVersion: 2; assets: FixturePublishedMesh[] }
  glb: Uint8Array
  fallbackPng: Uint8Array
}

export function createGeneratedMeshE2EFixture(): GeneratedMeshE2EFixture {
  const glb = createBoxGlb()
  const fallbackPng = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAO9nV1cAAAAASUVORK5CYII=',
      'base64'
    )
  )
  const meshSha256 = createHash('sha256').update(glb).digest('hex')
  const imageSha256 = createHash('sha256').update(fallbackPng).digest('hex')
  const product: FixtureProduct = {
    id: 'e2e-approved-mesh-product',
    name: 'E2E 검수 생성 메시 Fixture',
    category: 'living',
    dims: { w: 1000, d: 600, h: 500 },
    mount: 'floor',
    shape: 'box',
    appearance: {
      textureUrl: '/__e2e__/generated-mesh-fallback.png',
      imageSourceUrl: 'https://fixtures.invalid/generated-mesh-fallback.png',
      sha256: imageSha256,
      projection: 'front',
      removeWhiteBackground: false,
    },
  }
  const asset: FixturePublishedMesh = {
    assetId: 'e2e-approved-box-v1',
    productId: product.id,
    productFingerprint: buildFixtureFingerprint(product),
    uri: `/catalog/generated/${meshSha256}.glb`,
    sha256: meshSha256,
    byteLength: glb.byteLength,
    publishedAt: '2026-08-28T00:00:00.000Z',
    generatorLabel: 'deterministic E2E fixture',
    visualOnly: true,
  }
  return { product, manifest: { schemaVersion: 2, assets: [asset] }, glb, fallbackPng }
}

function buildFixtureFingerprint(product: FixtureProduct): string {
  return [
    'product-mesh-v1',
    product.id,
    product.dims.w,
    product.dims.d,
    product.dims.h,
    product.mount,
    product.appearance.sha256,
    product.appearance.imageSourceUrl,
  ].join('|')
}

function createBoxGlb(): Uint8Array {
  const positions = new Float32Array([
    -1, 0, -0.6, 1, 0, -0.6, 1, 1, -0.6, -1, 1, -0.6, -1, 0, 0.6, 1, 0, 0.6, 1, 1, 0.6, -1, 1, 0.6,
  ])
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 1, 5, 6, 1, 6, 2, 0, 3,
    7, 0, 7, 4,
  ])
  const binary = new Uint8Array(positions.byteLength + indices.byteLength)
  binary.set(new Uint8Array(positions.buffer), 0)
  binary.set(new Uint8Array(indices.buffer), positions.byteLength)
  const document = {
    asset: { version: '2.0', generator: 'interior3d-e2e-fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
            mode: 4,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.16, 0.58, 0.92, 1],
          metallicFactor: 0.05,
          roughnessFactor: 0.55,
        },
      },
    ],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: indices.byteLength,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: [-1, 0, -0.6],
        max: [1, 1, 0.6],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: indices.length,
        type: 'SCALAR',
        min: [0],
        max: [7],
      },
    ],
  }
  const json = Buffer.from(JSON.stringify(document))
  const jsonLength = Math.ceil(json.length / 4) * 4
  const binaryLength = Math.ceil(binary.length / 4) * 4
  const glb = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength)
  const view = new DataView(glb.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, glb.byteLength, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  glb.fill(0x20, 20, 20 + jsonLength)
  glb.set(json, 20)
  const binaryHeader = 20 + jsonLength
  view.setUint32(binaryHeader, binaryLength, true)
  view.setUint32(binaryHeader + 4, 0x004e4942, true)
  glb.set(binary, binaryHeader + 8)
  return glb
}
