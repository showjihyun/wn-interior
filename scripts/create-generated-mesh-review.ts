import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assessGeneratedMeshForReview } from '../src/application/generatedMeshReview'
import type { QuarantinedGeneratedMesh } from '../src/application/generatedMeshLifecycle'
import { StaticProductCatalog } from '../src/infrastructure/reference-data/StaticReferenceData'

const index = process.argv.indexOf('--record')
const requested = index >= 0 ? process.argv[index + 1] : undefined
if (!requested || process.argv.includes('--help')) {
  console.log('사용법: npm run mesh:review -- --record <quarantine/record.json>')
  process.exit(requested ? 0 : 1)
}
const quarantineRoot = path.resolve('artifacts', 'generated-mesh', 'quarantine')
const recordFile = path.resolve(requested)
const relative = path.relative(quarantineRoot, recordFile)
if (relative.startsWith('..') || path.isAbsolute(relative))
  throw new Error('mesh-review-path-outside-root')
const record = JSON.parse(await readFile(recordFile, 'utf8')) as {
  status?: string
  binary?: string
  asset?: QuarantinedGeneratedMesh
}
if (!record.asset || record.binary !== 'mesh.glb') throw new Error('mesh-review-record-invalid')
const product = new StaticProductCatalog().findById(record.asset.productId)
if (!product) throw new Error(`mesh-review-product-not-found:${record.asset.productId}`)

for (const view of record.asset.reviewViews) {
  const data = await readFile(path.join(path.dirname(recordFile), view.name))
  const digest = createHash('sha256').update(data).digest('hex')
  if (digest !== view.sha256 || data.byteLength !== view.byteLength) {
    throw new Error(`mesh-review-view-mismatch:${view.name}`)
  }
}
const assessment = assessGeneratedMeshForReview(product, record.asset)
const reportFile = path.join(path.dirname(recordFile), 'review.html')
const reviewTemplateFile = path.join(path.dirname(recordFile), 'review-template.json')
const renderedViews = record.asset.reviewViews.filter((view) => view.name.startsWith('view-'))
await writeFile(
  reviewTemplateFile,
  `${JSON.stringify(
    {
      reviewId: 'REPLACE_WITH_REVIEW_ID',
      contentSha256: record.asset.contentSha256,
      decision: 'rejected',
      reviewerRef: 'REPLACE_WITH_AUTHENTICATED_REVIEWER',
      reviewedAt: new Date().toISOString(),
      reviewedViewHashes: renderedViews.map((view) => view.sha256),
      visualOnlyAcknowledged: true,
    },
    null,
    2
  )}\n`
)
await writeFile(
  reportFile,
  `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="icon" href="data:,">
<title>${escapeHtml(product.name)} 생성 메시 검수</title>
<style>
body{margin:0;background:#11161b;color:#e8edf2;font:14px system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:32px}
h1{margin:0 0 8px}.muted{color:#8f9aa5}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:24px 0}
.metric,.notice{padding:14px;border:1px solid #313b45;border-radius:10px;background:#1a2128}.metric b{display:block;font-size:21px;margin-top:5px}
.pass{color:#65d59b}.fail{color:#ff8787}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.gallery figure{margin:0;padding:10px;background:#1a2128;border-radius:10px}.gallery img{width:100%;display:block;border-radius:6px}.gallery figcaption{padding-top:8px;color:#a8b2bc}
a{color:#78b7ff}.notice{margin:20px 0;line-height:1.6}</style></head>
<body><main><h1>${escapeHtml(product.name)} 생성 메시 검수</h1>
<p class="muted">${escapeHtml(record.asset.quarantineId)} · ${escapeHtml(record.asset.generator.name)} ${escapeHtml(record.asset.generator.version)}</p>
<section class="metrics">
<div class="metric">Silhouette IoU<b class="${assessment.silhouetteIou >= 0.75 ? 'pass' : 'fail'}">${assessment.silhouetteIou.toFixed(3)}</b></div>
<div class="metric">축 보정비<b class="${assessment.axisStretchRatio <= 2 ? 'pass' : 'fail'}">${assessment.axisStretchRatio.toFixed(3)}×</b></div>
<div class="metric">치수 비율 최대 오차<b class="${assessment.issues.includes('dimension-ratio-error-too-large') ? 'fail' : 'pass'}">${(assessment.maxDimensionRatioError * 100).toFixed(1)}%</b></div>
<div class="metric">Triangles<b>${assessment.triangles.toLocaleString()}</b></div>
<div class="metric">검수 이미지<b>${assessment.reviewViewCount}개</b></div>
</section>
<section class="notice"><b class="${assessment.readyForHumanReview ? 'pass' : 'fail'}">${assessment.readyForHumanReview ? '사람 검수 가능' : '자동 게이트 실패'}</b><br>
${assessment.issues.length ? assessment.issues.map(escapeHtml).join(', ') : '자동 품질 게이트를 통과했습니다. 아래 모든 시점을 확인한 뒤 review-template.json의 결정을 직접 변경하세요.'}<br>
<a href="mesh.glb">GLB 다운로드</a> · 공개 게시에는 별도 권리 증거가 필요합니다.</section>
<section class="gallery">${record.asset.reviewViews
    .map(
      (view) =>
        `<figure><img src="${encodeURIComponent(view.name)}" alt="${escapeHtml(view.name)}"><figcaption>${escapeHtml(view.name)}<br><small>${view.sha256}</small></figcaption></figure>`
    )
    .join('')}</section></main></body></html>`
)
console.log(JSON.stringify({ reportFile, reviewTemplateFile, assessment }, null, 2))

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
