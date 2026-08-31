import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ApprovedProductMesh } from '../src/application/productMeshApproval'
import { StaticApprovedMeshCatalog } from '../src/infrastructure/generated-mesh/StaticApprovedMeshCatalog'
import publishedManifest from '../src/infrastructure/generated-mesh/published-manifest.v2.json'
import {
  inspectGlbMesh,
  validateGlbContainer,
} from '../src/infrastructure/generated-mesh/glbValidation'
import { StaticProductCatalog } from '../src/infrastructure/reference-data/StaticReferenceData'

interface ApprovedManifest {
  schemaVersion: 2
  assets: ApprovedProductMesh[]
}

const projectRoot = process.cwd()
const generatedRoot = path.resolve(projectRoot, 'public', 'catalog', 'generated')
const manifest = publishedManifest as ApprovedManifest
const approvedCatalog = new StaticApprovedMeshCatalog(new StaticProductCatalog(), manifest)

if (approvedCatalog.list().length !== manifest.assets.length) {
  throw new Error('승인 manifest에 런타임 게이트를 통과하지 못한 항목이 있습니다.')
}

const referencedFiles = new Set<string>()
for (const asset of manifest.assets) {
  if (!asset.uri.startsWith('/catalog/generated/')) {
    throw new Error(`허용되지 않은 메시 경로: ${asset.uri}`)
  }
  const file = path.resolve(projectRoot, 'public', asset.uri.slice(1))
  const relative = path.relative(generatedRoot, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`메시 경로가 승인 디렉터리를 벗어납니다: ${asset.uri}`)
  }
  referencedFiles.add(path.normalize(file))
  const bytes = await readFile(file)
  const metadata = await stat(file)
  if (metadata.size > 80 * 1024 * 1024) throw new Error(`메시 크기 상한 초과: ${asset.assetId}`)
  if (metadata.size !== asset.byteLength) {
    throw new Error(`메시 byteLength 불일치: ${asset.assetId}`)
  }
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== asset.sha256) throw new Error(`메시 SHA-256 불일치: ${asset.assetId}`)
  const container = validateGlbContainer(bytes)
  if (!container.ok) {
    throw new Error(`GLB 컨테이너 검증 실패: ${asset.assetId} (${container.reasons.join(', ')})`)
  }
  const inspection = inspectGlbMesh(bytes)
  if (!inspection.ok) {
    throw new Error(
      `GLB 실제 geometry 검증 실패: ${asset.assetId} (${inspection.reasons.join(', ')})`
    )
  }
  if (inspection.report.triangles > 500_000) {
    throw new Error(`GLB triangle 상한 초과: ${asset.assetId}`)
  }
}

try {
  const deployedGlbs = await findGlbs(generatedRoot)
  const orphan = deployedGlbs.filter((file) => !referencedFiles.has(file))
  if (orphan.length > 0) {
    throw new Error(`manifest에 없는 GLB가 public에 있습니다: ${orphan.join(', ')}`)
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

console.log(`승인 생성 메시 ${manifest.assets.length}개: manifest·SHA-256·GLB 검증 통과`)

async function findGlbs(root: string): Promise<string[]> {
  const rootReal = await realpath(root)
  const found: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      const metadata = await lstat(target)
      if (metadata.isSymbolicLink()) throw new Error(`생성 메시 디렉터리 symlink 금지: ${target}`)
      const targetReal = await realpath(target)
      const relative = path.relative(rootReal, targetReal)
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`생성 메시 경로 이탈: ${target}`)
      }
      if (entry.isDirectory()) await visit(target)
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.glb') {
        found.push(path.normalize(target))
      }
    }
  }
  await visit(root)
  return found
}
