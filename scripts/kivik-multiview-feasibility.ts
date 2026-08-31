import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  assessMultiviewExperimentReadiness,
  compareMeshBenchmarkCandidates,
  type MultiviewSourceObservation,
} from '../src/application/generatedMeshExperiment'

const experimentRoot = path.resolve('.runtime', 'experiments', 'kivik-multiview')
const sourceRoot = path.join(experimentRoot, 'source')
const generatedRecordFile = path.resolve(
  'artifacts',
  'generated-mesh',
  'quarantine',
  'ik-kivik-3seat',
  'mesh-ik-kivik-3seat-1787900563519',
  'record.json'
)
const productPage = 'https://www.ikea.com/kr/en/p/kivik-3-seat-sofa-gunnared-blue-s69484873/'

const sources = [
  {
    id: 'front-oblique',
    file: 'PE1032891.jpg',
    url: 'https://www.ikea.com/kr/en/images/p/307eb7c47e732af3/kivik-3-seat-sofa-gunnared-blue/PE1032891.jpg',
    sha256: 'fadf574575297810d5ae0cae32204071b88adb2de473f87853deaadaf1ac799e',
    viewpoint: 'front-oblique',
    sameVariant: true,
    wholeProductVisible: true,
    independentGeometryEvidence: true,
  },
  {
    id: 'rear-oblique',
    file: 'PE760802.jpg',
    url: 'https://www.ikea.com/kr/en/images/p/24ba043e2b34ca2e/kivik-3-seat-sofa-gunnared-blue/PE760802.jpg',
    sha256: 'd210c535c9d1fab6bd826e51fce9ce0f42a7e018d5aef644fd7f0add7a89673e',
    viewpoint: 'rear-oblique',
    sameVariant: true,
    wholeProductVisible: false,
    independentGeometryEvidence: false,
  },
  {
    id: 'fabric-zip-detail',
    file: 'PE760804.jpg',
    url: 'https://www.ikea.com/kr/en/images/p/aff9cad4c6ffd63/kivik-3-seat-sofa-gunnared-blue/PE760804.jpg',
    sha256: '566a5524ca25dfce9420fc33d4a530c2bd897a77d7b979b121c970882b51e803',
    viewpoint: 'detail',
    sameVariant: true,
    wholeProductVisible: false,
    independentGeometryEvidence: false,
  },
  {
    id: 'lifestyle-detail',
    file: 'PE760805.jpg',
    url: 'https://www.ikea.com/kr/en/images/p/670f1fddd628dadb/kivik-3-seat-sofa-gunnared-blue/PE760805.jpg',
    sha256: '7c5138324cb6d20d844c274d10823080080265f082083a52648e361689f1bfcd',
    viewpoint: 'detail',
    sameVariant: true,
    wholeProductVisible: false,
    independentGeometryEvidence: false,
  },
  {
    id: 'fabric-detail',
    file: 'PE760889.jpg',
    url: 'https://www.ikea.com/kr/en/images/p/595cee4700ff00bd/kivik-3-seat-sofa-gunnared-blue/PE760889.jpg',
    sha256: '779fb2d83ffef71785a5f4e26f90646937966634481630cc0cf0ca6896a29520',
    viewpoint: 'detail',
    sameVariant: true,
    wholeProductVisible: false,
    independentGeometryEvidence: false,
  },
  {
    id: 'frame-cutaway-different-cover',
    file: 'PE878803.jpg',
    url: 'https://www.ikea.com/kr/en/images/p/30d276204a25c3b9/kivik-3-seat-sofa-gunnared-blue/PE878803.jpg',
    sha256: '7984f61d3b8087aca065f780397577dfa1ede8ba4f0d69fb64b279e1e41e0437',
    viewpoint: 'cutaway',
    sameVariant: false,
    wholeProductVisible: false,
    independentGeometryEvidence: false,
  },
] as const

const officialReference = {
  file: 'ikea-official-reference.glb',
  url: 'https://web-api.ikea.com/dimma/assets/geomagical/49484765/PS01_S01_NV_01/simple/glb_draco/661b927e5d435eb95212cbc20d3fc1ea-G-49484765-5fd4f3f9d418af0924ab2f8172a8205ca0a55a7f-simple+draco.glb?cn=pip',
  sha256: '7ce04fb0e8e4a8c40c80a3ccff9346430e9e2da93422d212aa6d6373f8cbf049',
}

if (process.argv.includes('--fetch')) await fetchInputs()
await verifyInputs()

const officialBytes = await readFile(path.join(experimentRoot, officialReference.file))
const official = declaredGeometryFromIkeaReferenceGlb(officialBytes)
const generatedRecord = JSON.parse(await readFile(generatedRecordFile, 'utf8')) as {
  asset: {
    inspection: {
      bounds: { w: number; d: number; h: number }
      triangles: number
    }
    byteLength: number
  }
}
const gpuVramMiB = Number(
  execFileSync('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)[0]
)
const readiness = assessMultiviewExperimentReadiness(
  sources satisfies readonly MultiviewSourceObservation[],
  {
    name: 'microsoft/TRELLIS-image-large',
    supportsMultipleImages: true,
    licenseUsableInKr: true,
    minimumVramMiB: 16_384,
  },
  { gpuVramMiB, minimumDistinctViews: 3 }
)
const candidates = compareMeshBenchmarkCandidates({ w: 2.28, d: 0.95, h: 0.83 }, [
  {
    name: 'TripoSR single image',
    bounds: generatedRecord.asset.inspection.bounds,
    triangles: generatedRecord.asset.inspection.triangles,
    byteLength: generatedRecord.asset.byteLength,
  },
  {
    name: 'IKEA DIMMA official reference',
    bounds: official.bounds,
    triangles: official.triangles,
    byteLength: officialBytes.byteLength,
  },
])

console.log(
  JSON.stringify(
    {
      experiment: 'kivik-multiview-feasibility-v1',
      productPage,
      sourceEvidence: sources.map(({ file: _file, ...source }) => source),
      localEnvironment: { gpuVramMiB },
      readiness,
      candidates,
      conclusion:
        readiness.status === 'ready'
          ? 'run-multiview-generation-ab'
          : 'do-not-install-multiview-model-use-official-reference-or-parametric-path',
      distribution: 'local-evidence-only-not-for-publication',
    },
    null,
    2
  )
)

async function fetchInputs(): Promise<void> {
  await mkdir(sourceRoot, { recursive: true })
  for (const source of sources) await download(source.url, path.join(sourceRoot, source.file))
  await download(officialReference.url, path.join(experimentRoot, officialReference.file))
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`kivik-experiment-download-failed:${response.status}:${url}`)
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()))
}

async function verifyInputs(): Promise<void> {
  for (const source of sources) {
    await verifySha256(path.join(sourceRoot, source.file), source.sha256)
  }
  await verifySha256(path.join(experimentRoot, officialReference.file), officialReference.sha256)
}

async function verifySha256(file: string, expected: string): Promise<void> {
  const actual = createHash('sha256')
    .update(await readFile(file))
    .digest('hex')
  if (actual !== expected)
    throw new Error(`kivik-experiment-sha256-mismatch:${path.basename(file)}`)
}

function declaredGeometryFromIkeaReferenceGlb(data: Uint8Array): {
  bounds: { w: number; d: number; h: number }
  triangles: number
} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (data.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    throw new Error('kivik-experiment-reference-not-glb')
  }
  let offset = 12
  let document: any
  while (offset + 8 <= data.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const chunk = data.slice(offset + 8, offset + 8 + length)
    if (type === 0x4e4f534a) {
      document = JSON.parse(new TextDecoder().decode(chunk).replace(/\0+$/u, ''))
    }
    offset += 8 + length
  }
  const primitive = document?.meshes?.[0]?.primitives?.[0]
  const position = document?.accessors?.[primitive?.attributes?.POSITION]
  const indices = document?.accessors?.[primitive?.indices]
  const nodes = document?.nodes ?? []
  if (
    document?.asset?.version !== '2.0' ||
    !document.extensionsRequired?.includes('KHR_draco_mesh_compression') ||
    !Array.isArray(position?.min) ||
    !Array.isArray(position?.max) ||
    position.min.length !== 3 ||
    position.max.length !== 3 ||
    !Number.isInteger(indices?.count) ||
    indices.count % 3 !== 0 ||
    nodes.some(
      (node: any) =>
        (node.rotation && JSON.stringify(node.rotation) !== '[0,0,0,1]') ||
        (node.scale && JSON.stringify(node.scale) !== '[1,1,1]')
    )
  ) {
    throw new Error('kivik-experiment-reference-geometry-unsupported')
  }
  return {
    bounds: {
      w: position.max[0] - position.min[0],
      d: position.max[2] - position.min[2],
      h: position.max[1] - position.min[1],
    },
    triangles: indices.count / 3,
  }
}
