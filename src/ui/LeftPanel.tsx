// ─────────────────────────────────────────────────────────────
// 좌측 패널 — 탭: 제품 카탈로그 / 마감재(방별 바닥재·벽지)
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { CATALOG, CATEGORIES } from '../data/catalog'
import { FLOOR_MATERIALS, WALL_MATERIALS } from '../data/materials'
import type { CategoryId, Product } from '../types'
import { useStore } from '../store/store'
import { getBrandList } from '../data/brandCatalog'
import { buildCostReport } from '../cost/costs'

const BRANDS = ['전체', ...getBrandList()] as const
const fmt = (v: number) => (v >= 1000 ? `${(v / 10).toFixed(0)}cm` : `${v}mm`)
const won = (v: number) => v.toLocaleString('ko-KR') + '원'

function ProductCard({ p, selected, placedCount }: { p: Product; selected?: boolean; placedCount?: number }) {
  const setPending = useStore((s) => s.setPending)
  const setMode = useStore((s) => s.setMode)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selected])

  return (
    <div
      ref={ref}
      className={`pcard${selected ? ' sel' : ''}`}
      onClick={() => {
        setPending(p.id)
        setMode('3d')
      }}
      title={`${p.name} 클릭 → 3D에서 위치 지정`}
    >
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
      </div>
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
  const [cat, setCat] = useState<CategoryId>('kitchen')
  const [brand, setBrand] = useState<(typeof BRANDS)[number]>('전체')
  const customProducts = useStore((s) => s.customProducts)
  const selectedId = useStore((s) => s.selectedId)
  const placements = useStore((s) => s.placements)
  const all = cat === 'custom' ? customProducts : CATALOG.filter((p) => p.category === cat)
  const list = brand === '전체' ? all : all.filter((p) => p.brand === brand)
  // 3D에서 선택한 배치물의 제품 → 카탈로그 카드 하이라이트 (양방향 동기화)
  const selectedProductId = placements.find((p) => p.id === selectedId)?.productId
  // 제품별 현재 배치 수 ("배치 N개" 뱃지)
  const placedCount = new Map<string, number>()
  for (const pl of placements) placedCount.set(pl.productId, (placedCount.get(pl.productId) ?? 0) + 1)

  return (
    <>
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
        {BRANDS.map((b) => (
          <button key={b} className={`bchip${brand === b ? ' on' : ''}`} onClick={() => setBrand(b)}>
            {b}
          </button>
        ))}
      </div>
      <div className="plist">
        {list.length === 0 && (
          <p className="hint" style={{ padding: 12 }}>
            {brand !== '전체' ? `${brand} 제품이 없는 카테고리입니다.` : '아래 "+ 등록"으로 내 가구를 추가하세요.'}
          </p>
        )}
        {list.map((p) => (
          <ProductCard key={p.id} p={p} selected={p.id === selectedProductId} placedCount={placedCount.get(p.id)} />
        ))}
      </div>
      {cat === 'custom' && <CustomForm />}
    </>
  )
}

function CustomForm() {
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
      useStore.getState().showToast('이름과 가로·세로·높이(mm)를 모두 입력하세요', 'error')
      return
    }
    if (url && !/^https?:\/\//.test(url)) {
      useStore.getState().showToast('모델 URL은 http(s):// 로 시작해야 합니다', 'error')
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
      <input placeholder="제품명 (예: 우리집 소파)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row3">
        <input placeholder="가로 mm" value={w} onChange={(e) => setW(e.target.value)} inputMode="numeric" />
        <input placeholder="세로 mm" value={d} onChange={(e) => setD(e.target.value)} inputMode="numeric" />
        <input placeholder="높이 mm" value={h} onChange={(e) => setH(e.target.value)} inputMode="numeric" />
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
  const plan = useStore((s) => s.plan)
  const setRoomMaterial = useStore((s) => s.setRoomMaterial)
  return (
    <div className="mlist">
      {plan.rooms.map((r) => (
        <div key={r.id} className="mroom">
          <b>{r.name}</b>
          <label>
            바닥재
            <select value={r.floorMaterialId ?? ''} onChange={(e) => setRoomMaterial(r.id, 'floorMaterialId', e.target.value)}>
              {FLOOR_MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            벽지
            <select value={r.wallMaterialId ?? ''} onChange={(e) => setRoomMaterial(r.id, 'wallMaterialId', e.target.value)}>
              {WALL_MATERIALS.map((m) => (
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
  const placements = useStore((s) => s.placements)
  const productOf = useStore((s) => s.productById)
  const r = buildCostReport(placements, productOf)

  return (
    <div className="costlist">
      <div className="cost-total">
        <span>참고 가격 합계</span>
        <b>{won(r.pricedTotal)}</b>
      </div>
      {r.lines.length === 0 && r.unpriced.length === 0 && (
        <p className="hint" style={{ padding: 12 }}>배치된 제품이 없습니다.</p>
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
              <a className="src" href={l.sourceUrl} target="_blank" rel="noreferrer" title="출처 (가격 스펙 페이지)">
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
