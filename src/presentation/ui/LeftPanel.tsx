// ─────────────────────────────────────────────────────────────
// 좌측 패널 — 탭: 제품 카탈로그 / 마감재(방별 바닥재·벽지)
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CategoryId, Product } from '../../domain/model'
import { useAppRuntime, useStore, useStoreApi } from '../AppRuntimeContext'
import { buildCostReport } from '../../domain/costs'

const CATEGORIES: Record<CategoryId, { label: string; icon: string }> = {
  kitchen: { label: '주방', icon: '🍳' },
  living: { label: '거실', icon: '🛋️' },
  bedroom: { label: '침실', icon: '🛏️' },
  storage: { label: '수납', icon: '🗄️' },
  'built-in': { label: '붙박이·맞춤수납', icon: '🧱' },
  'wall-finish': { label: '도배·벽마감', icon: '🧻' },
  flooring: { label: '바닥마감', icon: '🪵' },
  appliance: { label: '가전', icon: '📺' },
  lighting: { label: '조명', icon: '💡' },
  bath: { label: '욕실', icon: '🚿' },
  custom: { label: '내 가구 (직접 등록)', icon: '📏' },
}
const fmt = (v: number) => (v >= 1000 ? `${(v / 10).toFixed(0)}cm` : `${v}mm`)
const won = (v: number) => v.toLocaleString('ko-KR') + '원'
const CATALOG_FILE_ERRORS: Record<string, string> = {
  'spreadsheet-brand-unsupported': '한샘·리바트 전용 템플릿인지 확인해 주세요.',
  'spreadsheet-brand-mixed': '브랜드별로 파일을 나눠 가져와 주세요.',
  'spreadsheet-extension-unsupported': 'JSON, CSV, TSV, XLSX 파일만 지원합니다.',
  'spreadsheet-file-too-large': '파일은 10MB 이하여야 합니다.',
  'spreadsheet-empty': '상품 행이 없습니다.',
  'spreadsheet-columns-invalid': '표준 템플릿의 external_id와 brand 컬럼이 필요합니다.',
  'spreadsheet-formula-unsupported': '수식을 값으로 붙여넣은 뒤 다시 저장해 주세요.',
  'spreadsheet-xlsx-invalid': 'XLSX의 products 시트와 파일 형식을 확인해 주세요.',
  'spreadsheet-read-failed': '파일을 읽지 못했습니다.',
}
const LOCAL_REVIEW_ISSUE_LABELS: Record<string, string> = {
  'product-mismatch': '상품 불일치',
  'axis-stretch-too-large': '축 보정비 과다',
  'dimension-ratio-error-too-large': '공식 치수 비율 오차 5% 초과',
  'silhouette-score-too-low': '실루엣 점수 부족',
  'triangle-budget-exceeded': '삼각형 예산 초과',
  'insufficient-review-views': '검수 시점 부족',
}

function ProductCard({
  p,
  selected,
  pending,
  placedCount,
}: {
  p: Product
  selected?: boolean
  pending?: boolean
  placedCount?: number
}) {
  const setPending = useStore((s) => s.setPending)
  const setMode = useStore((s) => s.setMode)
  const { productVisuals, productVisualStatus } = useAppRuntime()
  const visual = productVisuals.resolve(p)
  const renderStatus = useSyncExternalStore(
    (listener) => productVisualStatus.subscribe(listener),
    () => productVisualStatus.get(p.id),
    () => undefined
  )
  const visualLabel =
    visual.kind === 'local-review-mesh'
      ? !visual.asset.reviewReady
        ? '로컬 생성 3D · 자동 게이트 실패'
        : renderStatus === 'local-review-loading'
          ? '로컬 생성 3D · 불러오는 중'
          : renderStatus === 'local-review-mesh'
            ? '로컬 생성 3D · 검수 중'
            : renderStatus === 'decal-fallback'
              ? '로컬 3D 오류 · 공식 사진 표시 중'
              : renderStatus === 'parametric-fallback'
                ? '로컬 3D·이미지 오류 · 기본 형상 표시 중'
                : '로컬 생성 3D · 검수 대기'
      : visual.kind === 'approved-mesh'
        ? renderStatus === 'mesh-loading'
          ? '검수된 3D 로딩 중'
          : renderStatus === 'approved-mesh'
            ? '검수된 3D 표시 중'
            : renderStatus === 'decal-fallback'
              ? '3D 모델 오류 · 공식 사진 표시 중'
              : renderStatus === 'parametric-fallback'
                ? '3D·이미지 오류 · 기본 형상 표시 중'
                : 'AI 생성 3D · 검수됨'
        : '공식 사진 기반 3D'
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selected])

  return (
    <div
      ref={ref}
      className={`pcard${selected ? ' sel' : ''}${pending ? ' placing' : ''}`}
      data-placement-pending={pending ? 'true' : undefined}
      onClick={() => {
        setPending(p.id)
        setMode('3d')
      }}
      title={`${p.name} 클릭 → 3D에서 위치 지정`}
    >
      {p.appearance && (
        <div className="retail-thumb-wrap">
          <img
            className="retail-thumb"
            src={p.appearance.textureUrl}
            alt={`${p.name} 공식 상품 이미지`}
            loading="lazy"
          />
          <span
            data-visual-capability={visual.kind}
            data-render-source={renderStatus}
            data-review-readiness={
              visual.kind === 'local-review-mesh'
                ? visual.asset.reviewReady
                  ? 'ready'
                  : 'failed'
                : undefined
            }
            title={
              visual.kind === 'approved-mesh'
                ? `${visual.asset.generatorLabel} · ${visual.asset.publishedAt} 게시 · 배치 판정에는 공식 치수 사용`
                : visual.kind === 'local-review-mesh'
                  ? `${visual.asset.generatorLabel} · ${visual.asset.generatedAt} 생성 · 로컬 전용, 미게시 · ${visual.asset.reviewReady ? '자동 게이트 통과' : `자동 게이트 실패: ${visual.asset.reviewIssues.map((issue) => LOCAL_REVIEW_ISSUE_LABELS[issue] ?? issue).join(', ')} · 치수 비율 최대 오차 ${(visual.asset.maxDimensionRatioError * 100).toFixed(1)}%`}`
                  : '공식 상품 사진을 실측 기반 기본 형상 위에 투영'
            }
          >
            {visualLabel}
          </span>
        </div>
      )}
      <div className="pname">
        {p.name}
        {p.brand && <span className="brand-tag">{p.brand}</span>}
        {!!placedCount && <span className="placed-badge">배치 {placedCount}개</span>}
      </div>
      <div className="pdims">
        W{fmt(p.dims.w)} · D{fmt(p.dims.d)} · H{fmt(p.dims.h)}
        {p.model && <span className="model"> · {p.model}</span>}
        {p.snapToWall && <span className="tag">벽부착</span>}
        {p.mount === 'wall-mount' && <span className="tag">벽걸이</span>}
        {p.sourceUrl && (
          <a
            className="src"
            href={p.sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="출처 (공식 스펙 페이지)"
          >
            ↗
          </a>
        )}
        {visual.kind === 'local-review-mesh' && visual.asset.reviewReportUrl && (
          <a
            className="src"
            href={visual.asset.reviewReportUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            title="로컬 생성 메시 검수 보고서"
          >
            ◫ 검수
          </a>
        )}
      </div>
      {p.retail && (
        <div
          className="retail-price"
          title={`${p.retail.priceBasis}${p.retail.excluded.length ? ` · 별도: ${p.retail.excluded.join(', ')}` : ''}`}
        >
          <strong>{won(p.retail.amount)}</strong>
          <span>{p.retail.priceBasis}</span>
          <small>
            {p.retail.retailer} · {p.retail.checkedAt} 확인
          </small>
        </div>
      )}
      {p.colorways && p.colorways.length > 0 && (
        <div className="card-swatches">
          {p.colorways.slice(0, 4).map((c) => (
            <span key={c} className="card-sw" style={{ background: c }} />
          ))}
        </div>
      )}
    </div>
  )
}

function CatalogTab() {
  const { productCatalog, catalogFileToProtocol } = useAppRuntime()
  const customProducts = useStore((s) => s.customProducts)
  const products = [...productCatalog.list(), ...customProducts]
  const brands = [
    '전체',
    ...new Set(products.flatMap((product) => (product.brand ? [product.brand] : []))),
  ]
  const [cat, setCat] = useState<CategoryId>('kitchen')
  const [brand, setBrand] = useState('전체')
  const importProductCatalog = useStore((s) => s.importProductCatalog)
  const importRef = useRef<HTMLInputElement>(null)
  const [importReport, setImportReport] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const selectedId = useStore((s) => s.selectedId)
  const pendingProductId = useStore((s) => s.pendingProductId)
  const placements = useStore((s) => s.placements)
  const all = cat === 'custom' ? customProducts : products.filter((p) => p.category === cat)
  const list = brand === '전체' ? all : all.filter((p) => p.brand === brand)
  // 3D에서 선택한 배치물의 제품 → 카탈로그 카드 하이라이트 (양방향 동기화)
  const selectedProductId = placements.find((p) => p.id === selectedId)?.productId
  // 제품별 현재 배치 수 ("배치 N개" 뱃지)
  const placedCount = new Map<string, number>()
  for (const pl of placements)
    placedCount.set(pl.productId, (placedCount.get(pl.productId) ?? 0) + 1)

  return (
    <>
      <div className="catalog-import">
        <button type="button" disabled={isImporting} onClick={() => importRef.current?.click()}>
          {isImporting ? '파일 확인 중…' : '⬇ 상품 카탈로그 파일'}
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,text/csv,.json,.csv,.tsv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="상품 카탈로그 JSON CSV XLSX 가져오기"
          style={{ display: 'none' }}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            setIsImporting(true)
            setImportReport(`${file.name} 확인 중…`)
            try {
              const document = file.name.toLowerCase().endsWith('.json')
                ? await file.text()
                : JSON.stringify(await catalogFileToProtocol(file))
              const result = importProductCatalog(document)
              setImportReport(
                result.ok
                  ? `${file.name} · 신규 ${result.imported}개 · 갱신 ${result.updated}개 · 경고 ${result.issues.length}개`
                  : `거절 · ${result.issues[0]?.path ?? '$'} · ${result.issues[0]?.message ?? '알 수 없는 오류'}`
              )
            } catch (error) {
              const code =
                error &&
                typeof error === 'object' &&
                'code' in error &&
                typeof error.code === 'string'
                  ? error.code
                  : 'spreadsheet-read-failed'
              setImportReport(
                `거절 · ${CATALOG_FILE_ERRORS[code] ?? CATALOG_FILE_ERRORS['spreadsheet-read-failed']}`
              )
            } finally {
              setIsImporting(false)
              event.target.value = ''
            }
          }}
        />
        <div className="catalog-template-links" aria-label="카탈로그 템플릿 다운로드">
          <span>템플릿</span>
          <a href="/catalog-templates/hanssem-catalog-template.xlsx" download>
            한샘 XLSX
          </a>
          <a href="/catalog-templates/hanssem-catalog-template.csv" download>
            CSV
          </a>
          <i aria-hidden="true" />
          <a href="/catalog-templates/livart-catalog-template.xlsx" download>
            리바트 XLSX
          </a>
          <a href="/catalog-templates/livart-catalog-template.csv" download>
            CSV
          </a>
        </div>
        {importReport && (
          <span role="status" aria-label="카탈로그 Import 결과">
            {importReport}
          </span>
        )}
      </div>
      <div className="cats">
        {(Object.keys(CATEGORIES) as CategoryId[]).map((c) => (
          <button key={c} className={`cat${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
            {CATEGORIES[c].icon}
            <br />
            {CATEGORIES[c].label}
          </button>
        ))}
      </div>
      <div className="brandbar">
        {brands.map((b) => (
          <button
            key={b}
            className={`bchip${brand === b ? ' on' : ''}`}
            onClick={() => setBrand(b)}
          >
            {b}
          </button>
        ))}
      </div>
      <div className="plist">
        {list.length === 0 && (
          <p className="hint" style={{ padding: 12 }}>
            {brand === 'IKEA' && cat === 'wall-finish'
              ? 'IKEA Korea 공식 도배·벽마감 판매 상품을 확인하지 못했습니다.'
              : brand !== '전체'
                ? `${brand} 제품이 없는 카테고리입니다.`
                : '아래 "+ 등록"으로 내 가구를 추가하세요.'}
          </p>
        )}
        {list.map((p) => (
          <ProductCard
            key={p.id}
            p={p}
            selected={p.id === selectedProductId}
            pending={p.id === pendingProductId}
            placedCount={placedCount.get(p.id)}
          />
        ))}
      </div>
      {cat === 'custom' && <CustomForm />}
    </>
  )
}

function CustomForm() {
  const store = useStoreApi()
  const add = useStore((s) => s.addCustomProduct)
  const [name, setName] = useState('')
  const [w, setW] = useState('')
  const [d, setD] = useState('')
  const [h, setH] = useState('')
  const [url, setUrl] = useState('')

  function submit() {
    const W = parseInt(w)
    const D = parseInt(d)
    const H = parseInt(h)
    if (!name || !W || !D || !H) {
      store.getState().showToast('이름과 가로·세로·높이(mm)를 모두 입력하세요', 'error')
      return
    }
    if (url && !/^https?:\/\//.test(url)) {
      store.getState().showToast('모델 URL은 http(s):// 로 시작해야 합니다', 'error')
      return
    }
    add({
      name,
      category: 'custom',
      dims: { w: W, d: D, h: H },
      mount: 'floor',
      shape: 'box',
      colorways: ['#c9b99a'],
      modelUrl: url.trim() || undefined,
    })
    setName('')
    setW('')
    setD('')
    setH('')
    setUrl('')
  }

  return (
    <div className="custom-form">
      <b>📏 실측 제품 등록</b>
      <input
        placeholder="제품명 (예: 우리집 소파)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="row3">
        <input
          placeholder="가로 mm"
          value={w}
          onChange={(e) => setW(e.target.value)}
          inputMode="numeric"
        />
        <input
          placeholder="세로 mm"
          value={d}
          onChange={(e) => setD(e.target.value)}
          inputMode="numeric"
        />
        <input
          placeholder="높이 mm"
          value={h}
          onChange={(e) => setH(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <input
        placeholder="GLTF 모델 URL (선택 — 예: https://.../chair.glb)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button className="primary" onClick={submit}>
        + 카탈로그에 등록
      </button>
    </div>
  )
}

function MaterialTab() {
  const { materialCatalog } = useAppRuntime()
  const materials = materialCatalog.list()
  const floorMaterials = materials.filter((material) => material.kind === 'floor')
  const wallMaterials = materials.filter((material) => material.kind === 'wall')
  const plan = useStore((s) => s.plan)
  const setRoomMaterial = useStore((s) => s.setRoomMaterial)
  return (
    <div className="mlist">
      {plan.rooms.map((r) => (
        <div key={r.id} className="mroom">
          <b>{r.name}</b>
          <label>
            바닥재
            <select
              value={r.floorMaterialId ?? ''}
              onChange={(e) => setRoomMaterial(r.id, 'floorMaterialId', e.target.value)}
            >
              {floorMaterials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            벽지
            <select
              value={r.wallMaterialId ?? ''}
              onChange={(e) => setRoomMaterial(r.id, 'wallMaterialId', e.target.value)}
            >
              {wallMaterials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}
      <p className="hint" style={{ padding: '8px 12px' }}>
        마감재는 실제 규격(600×600 장판, 마루 플랭크 등)으로 타일링됩니다.
      </p>
    </div>
  )
}

// ── 가격 탭: 배치 제품 합산 (출처 기반 참고가격) ──
function CostTab() {
  const { generateQuote, textFileExporter } = useAppRuntime()
  const placements = useStore((s) => s.placements)
  const productOf = useStore((s) => s.productById)
  const plan = useStore((s) => s.plan)
  const projectName = useStore((s) => s.projectName)
  const r = buildCostReport(placements, productOf)

  function downloadQuoteFile() {
    textFileExporter.download(
      generateQuote.execute({ projectName, plan, placements }),
      `${projectName}-견적서.md`,
      'text/markdown;charset=utf-8'
    )
  }

  return (
    <div className="costlist">
      <div className="cost-total">
        <span>참고 가격 합계</span>
        <b>{won(r.pricedTotal)}</b>
      </div>
      <button
        className="quote-btn"
        onClick={downloadQuoteFile}
        title="방 면적·마감재·제품 합계를 마크다운 견적서로 저장"
      >
        📄 견적서 다운로드 (.md)
      </button>
      {r.lines.length === 0 && r.unpriced.length === 0 && (
        <p className="hint" style={{ padding: 12 }}>
          배치된 제품이 없습니다.
        </p>
      )}
      {r.lines.map((l) => (
        <div key={l.productId} className="cost-line">
          <div className="cl-name">
            {l.name}
            {l.brand && <span className="brand-tag">{l.brand}</span>}
          </div>
          <div className="cl-row">
            <span>
              {won(l.unitPrice)} × {l.qty}
            </span>
            <b>{won(l.subtotal)}</b>
            {l.sourceUrl && (
              <a
                className="src"
                href={l.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title="출처 (가격 스펙 페이지)"
              >
                ↗ 출처
              </a>
            )}
          </div>
          {l.priceNote && <div className="cl-note">{l.priceNote}</div>}
        </div>
      ))}
      {r.unpriced.length > 0 && (
        <>
          <div className="cost-sep">가격 미확인 (매장 견적 필요)</div>
          {r.unpriced.map((u) => (
            <div key={u.productId} className="cost-line muted">
              <div className="cl-name">{u.name}</div>
              <div className="cl-row">
                <span>수량 {u.qty}</span>
                <b>견적 필요</b>
              </div>
            </div>
          ))}
        </>
      )}
      <p className="hint" style={{ padding: '8px 12px' }}>
        가격은 각 출처(↗) 시점의 참고 판매가로, 옵션·프로모션에 따라 달라질 수 있습니다.
      </p>
    </div>
  )
}

export function LeftPanel() {
  const [tab, setTab] = useState<'cat' | 'mat' | 'cost'>('cat')
  return (
    <div className="left">
      <div className="tabs">
        <button className={tab === 'cat' ? 'on' : ''} onClick={() => setTab('cat')}>
          🛋️ 배치
        </button>
        <button className={tab === 'mat' ? 'on' : ''} onClick={() => setTab('mat')}>
          🎨 마감재
        </button>
        <button className={tab === 'cost' ? 'on' : ''} onClick={() => setTab('cost')}>
          💰 가격
        </button>
      </div>
      {tab === 'cat' ? <CatalogTab /> : tab === 'mat' ? <MaterialTab /> : <CostTab />}
    </div>
  )
}
