import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  selectMultiviewRegenerationCandidate,
  type MultiviewRegenerationCandidate,
} from '../src/application/generatedMeshExperiment'
import { buildProductMeshFingerprint } from '../src/application/generatedMeshLifecycle'
import { HttpGeneratedMeshWorker } from '../src/infrastructure/generated-mesh/HttpGeneratedMeshWorker'
import { inspectGlbMesh } from '../src/infrastructure/generated-mesh/glbValidation'
import { StaticProductCatalog } from '../src/infrastructure/reference-data/StaticReferenceData'

const productId = 'ik-kivik-3seat'
const experimentRoot = path.resolve('.runtime', 'experiments', 'kivik-multiview')
const sourceRoot = path.join(experimentRoot, 'source')
const workerUrl = argumentValue('--worker-url') ?? 'http://127.0.0.1:8980'
const outputRoot = path.resolve(
  'artifacts',
  'generated-mesh',
  'quarantine',
  productId,
  `kivik-multiview-ab-${Date.now()}`
)
const sourceDefinitions = [
  {
    id: 'front-hires',
    name: 'TripoSR front-oblique high resolution',
    viewpoint: 'front-oblique',
    file: 'PE1032891.jpg',
    sha256: 'fadf574575297810d5ae0cae32204071b88adb2de473f87853deaadaf1ac799e',
    sameVariant: true,
    wholeProductVisible: true,
    independentGeometryEvidence: true,
  },
  {
    id: 'rear-hires',
    name: 'TripoSR rear-oblique high resolution',
    viewpoint: 'rear-oblique',
    file: 'PE760802.jpg',
    sha256: 'd210c535c9d1fab6bd826e51fce9ce0f42a7e018d5aef644fd7f0add7a89673e',
    sameVariant: true,
    wholeProductVisible: false,
    independentGeometryEvidence: false,
  },
] as const

const catalog = new StaticProductCatalog()
const product = catalog.findById(productId)
if (!product) throw new Error(`kivik-regeneration-product-not-found:${productId}`)
const productFingerprint = buildProductMeshFingerprint(product)
const worker = new HttpGeneratedMeshWorker(workerUrl)
const generated: Array<{
  candidate: MultiviewRegenerationCandidate
  glb: Uint8Array
  generator: { name: string; version: string; modelDigest: string }
  generatedAt: string
  reviewViews: Array<{ name: string; png: Uint8Array; sha256: string }>
}> = []

const eligibleSourceDefinitions = sourceDefinitions.filter(
  (source) => source.sameVariant && source.wholeProductVisible && source.independentGeometryEvidence
)
const excludedSourceEvidence = sourceDefinitions
  .filter((source) => !eligibleSourceDefinitions.includes(source))
  .map((source) => ({
    id: source.id,
    viewpoint: source.viewpoint,
    reasons: [
      ...(source.sameVariant ? [] : ['different-variant']),
      ...(source.wholeProductVisible ? [] : ['whole-product-not-visible']),
      ...(source.independentGeometryEvidence ? [] : ['independent-geometry-evidence-missing']),
    ],
  }))

for (const sourceDefinition of eligibleSourceDefinitions) {
  const sourcePath = path.join(sourceRoot, sourceDefinition.file)
  const sourceBytes = new Uint8Array(await readFile(sourcePath))
  verifyHash(sourceBytes, sourceDefinition.sha256, `source:${sourceDefinition.id}`)
  const output = await worker.generate({
    jobId: `kivik-${sourceDefinition.id}-${Date.now()}`,
    productId,
    productFingerprint,
    targetDims: product.dims,
    source: {
      bytes: sourceBytes,
      mimeType: 'image/jpeg',
      sha256: sourceDefinition.sha256,
    },
  })
  verifyHash(output.glb, output.contentSha256, `glb:${sourceDefinition.id}`)
  for (const view of output.reviewViews) {
    verifyHash(view.png, view.sha256, `review:${sourceDefinition.id}:${view.name}`)
  }
  const inspection = inspectGlbMesh(output.glb)
  if (!inspection.ok) {
    throw new Error(
      `kivik-regeneration-glb-invalid:${sourceDefinition.id}:${inspection.reasons.join(',')}`
    )
  }
  generated.push({
    candidate: {
      id: sourceDefinition.id,
      name: sourceDefinition.name,
      viewpoint: sourceDefinition.viewpoint,
      sourceImageSha256: sourceDefinition.sha256,
      sameVariant: sourceDefinition.sameVariant,
      wholeProductVisible: sourceDefinition.wholeProductVisible,
      independentGeometryEvidence: sourceDefinition.independentGeometryEvidence,
      bounds: inspection.report.bounds,
      triangles: inspection.report.triangles,
      byteLength: output.glb.byteLength,
      silhouetteIou: output.silhouetteIou,
    },
    glb: output.glb,
    generator: output.generator,
    generatedAt: output.generatedAt,
    reviewViews: output.reviewViews,
  })
}

const selection = selectMultiviewRegenerationCandidate(
  product.dims,
  generated.map((item) => item.candidate)
)
const bestAttempt = generated.find((item) => item.candidate.id === selection.bestAttemptId)
if (!bestAttempt) throw new Error('kivik-regeneration-best-attempt-missing')

await mkdir(outputRoot, { recursive: true })
await writeFile(path.join(outputRoot, 'mesh.glb'), bestAttempt.glb)
for (const view of bestAttempt.reviewViews) {
  await writeFile(path.join(outputRoot, view.name), view.png)
}
const quarantineId = path.basename(outputRoot)
const contentSha256 = sha256(bestAttempt.glb)
const reviewRecord = {
  schemaVersion: 1,
  status: 'review-pending',
  binary: 'mesh.glb',
  asset: {
    quarantineId,
    productId,
    productFingerprint,
    sourceImageSha256: bestAttempt.candidate.sourceImageSha256,
    contentSha256,
    byteLength: bestAttempt.glb.byteLength,
    generatedAt: bestAttempt.generatedAt,
    generator: bestAttempt.generator,
    inspection: {
      bounds: bestAttempt.candidate.bounds,
      triangles: bestAttempt.candidate.triangles,
      silhouetteIou: bestAttempt.candidate.silhouetteIou,
    },
    reviewViews: bestAttempt.reviewViews.map((view) => ({
      name: view.name,
      sha256: view.sha256,
      byteLength: view.png.byteLength,
    })),
  },
}
await writeFile(
  path.join(outputRoot, 'record.json'),
  `${JSON.stringify(reviewRecord, null, 2)}\n`,
  'utf8'
)
const report = {
  schemaVersion: 1,
  experiment: 'kivik-multiview-candidate-selection-v1',
  productId,
  productFingerprint,
  targetDims: product.dims,
  workerUrl,
  generator: bestAttempt.generator,
  generatedAt: bestAttempt.generatedAt,
  status: selection.status,
  selectedCandidateId: selection.selectedCandidateId,
  bestAttemptId: selection.bestAttemptId,
  reasons: selection.reasons,
  sourceEvidence: sourceDefinitions.map(({ file: _file, name, ...source }) => ({
    name,
    ...source,
  })),
  excludedSourceEvidence,
  candidates: selection.candidates,
  retainedBinary: 'mesh.glb',
  retainedBinarySha256: contentSha256,
  retainedReviewViews: bestAttempt.reviewViews.map((view) => ({
    name: view.name,
    sha256: view.sha256,
    byteLength: view.png.byteLength,
  })),
  publicationEligible: false,
  publicationBlockers:
    selection.status === 'gate-passed'
      ? ['rights-and-human-review-required']
      : ['automatic-quality-gate-failed'],
  distribution: 'quarantine-only-not-for-publication',
}
await writeFile(
  path.join(outputRoot, 'experiment-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
)
console.log(JSON.stringify({ outputRoot, ...report }, null, 2))

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function verifyHash(bytes: Uint8Array, expected: string, label: string): void {
  const actual = sha256(bytes)
  if (actual !== expected) throw new Error(`kivik-regeneration-hash-mismatch:${label}:${actual}`)
}
