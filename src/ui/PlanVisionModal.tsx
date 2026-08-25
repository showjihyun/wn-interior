// ─────────────────────────────────────────────────────────────
// CV 도면 자동 변환 모달 — 업로드 → 파라미터 슬라이더 → 실시간 오버레이 프리뷰 → FloorPlan 적용
// LLM 불필요. planVision 엔진 + normalizeAiPlan 검증 재사용.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { toGray, buildPlanFromImage, autoThresholdOtsu, invertGray, inkRatio, type Gray, type PlanVisionOpts } from '../engine/planVision'
import { normalizeAiPlan } from '../ai/normalizePlan'
import { useStore } from '../store/store'

const MAX_DIM = 1600 // 성능 가드: 긴 변 최대 px

export function PlanVisionModal({ onClose }: { onClose: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [status, setStatus] = useState('')
  const [threshold, setThreshold] = useState(128)
  const [minThickness, setMinThickness] = useState(4)
  const [minLength, setMinLength] = useState(40)
  const [exteriorMm, setExteriorMm] = useState(200)
  const [useOtsu, setUseOtsu] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const grayRef = useRef<Gray | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadFile = (f: File) => {
    const url = URL.createObjectURL(f)
    const im = new Image()
    im.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(im.naturalWidth, im.naturalHeight))
      im.width = Math.round(im.naturalWidth * scale)
      im.height = Math.round(im.naturalHeight * scale)
      setImg(im)
      setStatus(`이미지 로드: ${im.naturalWidth}×${im.naturalHeight}px`)
    }
    im.src = url
  }

  /** 이미지 → Gray (캔버스 경유) */
  const rgbaRef = useRef<ImageData | null>(null)
  const computeGray = useCallback(
    (im: HTMLImageElement, th: number): Gray | null => {
      const c = document.createElement('canvas')
      c.width = im.width
      c.height = im.height
      const ctx = c.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(im, 0, 0, c.width, c.height)
      const id = ctx.getImageData(0, 0, c.width, c.height)
      rgbaRef.current = id
      const g0 = toGray(id.data, c.width, c.height, th)
      // 어두운 배경(반전 도면) 자동 감지 → 반전
      return inkRatio(g0) > 0.5 ? invertGray(g0) : g0
    },
    [],
  )

  /** 파이프라인 실행 + 프리뷰 렌더 */
  const run = useCallback(() => {
    if (!img || !canvasRef.current) return
    let th = threshold
    if (useOtsu) {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      th = autoThresholdOtsu(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
    }
    const gray = computeGray(img, th)
    if (!gray) return
    grayRef.current = gray
    const opts: PlanVisionOpts = {
      threshold: th,
      morphCloseRadius: 2,
      denoiseMinComponentPx: 300,
      orthoToleranceMm: 80,
      minThicknessPx: minThickness,
      minLengthPx: minLength,
      gapRangeMm: [500, 1400],
      exteriorWallMm: exteriorMm,
      minRoomAreaM2: 1.5,
      wallHeightMm: 2400,
    }
    let raw
    try {
      raw = buildPlanFromImage(gray, opts)
    } catch (e) {
      setStatus(`실패: ${(e as Error).message}`)
      return
    }
    // 프리뷰 렌더
    const cv = canvasRef.current
    cv.width = gray.width
    cv.height = gray.height
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, cv.width, cv.height)
    // 방 반투명 채움
    const colors = ['#4a90c233', '#59d49933', '#ffb3002b', '#c26eb233', '#e0555533']
    raw.rooms.forEach((r, i) => {
      ctx.fillStyle = colors[i % colors.length]
      ctx.beginPath()
      r.polygon.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x / raw.mmPerPx, p.y / raw.mmPerPx) : ctx.lineTo(p.x / raw.mmPerPx, p.y / raw.mmPerPx)))
      ctx.closePath()
      ctx.fill()
    })
    // 벽 (빨강, 두께 반영)
    ctx.strokeStyle = '#e04040'
    for (const w of raw.walls) {
      ctx.lineWidth = Math.max(2, w.thickness / raw.mmPerPx)
      ctx.beginPath()
      ctx.moveTo(w.a.x / raw.mmPerPx, w.a.y / raw.mmPerPx)
      ctx.lineTo(w.b.x / raw.mmPerPx, w.b.y / raw.mmPerPx)
      ctx.stroke()
    }
    // 문 (파랑)
    ctx.strokeStyle = '#2b6fd8'
    ctx.lineWidth = 3
    for (const o of raw.openings) {
      const half = o.width / raw.mmPerPx / 2
      ctx.beginPath()
      ctx.moveTo(o.at.x / raw.mmPerPx - half, o.at.y / raw.mmPerPx - 6)
      ctx.lineTo(o.at.x / raw.mmPerPx + half, o.at.y / raw.mmPerPx - 6)
      ctx.stroke()
    }
    setStatus(
      `벽 ${raw.walls.length}개 · 방 ${raw.rooms.length}개 · 문 후보 ${raw.openings.length}개 · 축척 1px=${raw.mmPerPx.toFixed(1)}mm`,
    )
  }, [img, threshold, minThickness, minLength, exteriorMm, useOtsu, computeGray])

  // 파라미터 변경 시 디바운스 재실행
  useEffect(() => {
    if (!img) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(run, 250)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [img, threshold, minThickness, minLength, exteriorMm, run])

  function apply() {
    if (!img || !grayRef.current) return
    try {
      const raw = buildPlanFromImage(grayRef.current, {
      threshold,
      minThicknessPx: minThickness,
      minLengthPx: minLength,
      gapRangeMm: [500, 1400],
      exteriorWallMm: exteriorMm,
      minRoomAreaM2: 1.5,
      wallHeightMm: 2400,
    })
    // 문 갭 mm 필터 (normalize 전 적용 — 이후 인덱스 대응으로 offset 재계산)
    const keptOpenings = raw.openings.filter((o) => o.width >= 500 && o.width <= 1400)
    const norm = normalizeAiPlan({
      wallHeight: raw.wallHeight,
      walls: raw.walls,
      openings: keptOpenings.map((o) => ({
        wallId: 'w1', // normalize 후 실제 최근접 벽으로 재매칭
        type: 'door' as const,
        offset: 0,
        width: o.width,
        height: 2000,
        sill: 0,
      })),
      rooms: raw.rooms,
    })
    if (!norm.ok || !norm.plan) {
      useStore.getState().showToast(`도면 변환 실패: ${norm.error}`, 'error')
      return
    }
    // opening offset 재계산 (벽 시작점부터의 거리) — keptOpenings[i] ↔ norm.openings[i] 순서 대응
    const st = useStore.getState()
    const nplan = norm.plan
    nplan.openings.forEach((o, i) => {
      const w = nplan.walls.find((x) => x.id === o.wallId)
      if (!w) return
      const at = keptOpenings[i].at
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1
      const t = ((at.x - w.a.x) * (w.b.x - w.a.x) + (at.y - w.a.y) * (w.b.y - w.a.y)) / (len * len)
      o.offset = Math.max(0, Math.min(len - o.width, t * len))
    })
    st.loadProject({
      version: 1,
      name: 'CV 도면 변환',
      plan: nplan,
      placements: [],
      customProducts: st.customProducts,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    st.setMode('2d')
    setStatus('적용 완료! 2D 편집기에서 보정하세요.')
    setTimeout(onClose, 900)
    } catch (e) {
      console.error('[PlanVision] apply 실패', e)
      useStore.getState().showToast(`도면 변환 실패: ${(e as Error).message}`, 'error')
      setStatus(`적용 실패: ${(e as Error).message}`)
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>🧮 도면 자동 변환 (CV 엔진 · LLM 불필요)</h3>
        <p className="hint">
          두꺼운 벽선을 검출해 3D 평면도로 변환합니다. 직교(직각) 평면도에 최적 · 치수선·텍스트는 자동 필터.
          변환 후 2D 편집기에서 문·창문 위치와 치수를 보정하세요.
        </p>
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />

        {img && (
          <div className="pv-controls">
            <label>
              이진화 임계값 {threshold}
              <input type="range" min={60} max={220} value={threshold} onChange={(e) => setThreshold(+e.target.value)} />
            </label>
            <label>
              최소 벽 두께 {minThickness}px
              <input type="range" min={2} max={20} value={minThickness} onChange={(e) => setMinThickness(+e.target.value)} />
            </label>
            <label>
              최소 벽 길이 {minLength}px
              <input type="range" min={20} max={200} value={minLength} onChange={(e) => setMinLength(+e.target.value)} />
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={useOtsu} onChange={(e) => setUseOtsu(e.target.checked)} /> 자동 임계값(Otsu)
            </label>
            <label>
              외벽 두께(축척 기준) {exteriorMm}mm
              <input type="range" min={100} max={400} step={10} value={exteriorMm} onChange={(e) => setExteriorMm(+e.target.value)} />
            </label>
          </div>
        )}

        <div className="pv-preview">
          <canvas ref={canvasRef} style={{ maxWidth: '100%', background: '#fff' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="primary" disabled={!img} onClick={apply}>
            3D 평면도로 변환 적용
          </button>
          <button onClick={onClose}>닫기</button>
        </div>
        {status && <p className="status">{status}</p>}
      </div>
    </div>
  )
}

/** opening at 좌표에 가장 가까운 벽 id */
function nearestWallId(walls: { a: { x: number; y: number }; b: { x: number; y: number }; id: string }[], at: { x: number; y: number }): string {
  let best = walls[0]?.id
  let bestD = Infinity
  for (const w of walls) {
    const dx = w.b.x - w.a.x
    const dy = w.b.y - w.a.y
    const len2 = dx * dx + dy * dy || 1
    let t = ((at.x - w.a.x) * dx + (at.y - w.a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(at.x - (w.a.x + dx * t), at.y - (w.a.y + dy * t))
    if (d < bestD) {
      bestD = d
      best = w.id
    }
  }
  return best!
}
