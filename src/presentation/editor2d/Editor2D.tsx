// ─────────────────────────────────────────────────────────────
// 2D 편집기 (SVG)
// 도구: 선택/이동 · 벽 그리기(연속) · 문/창문 배치 · 이미지 트레이싱(스케일 보정)
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import type { FloorPlanReviewDecision, FloorPlanReviewTargetKind, Pt } from '../../domain/model'
import { useStore } from '../AppRuntimeContext'
import { wallLength, projectOnSegment, snapGrid } from '../../domain/engine/geom'
import { createOpeningOnNearestWall } from '../../domain/openingPolicy'
import { getPlanBounds } from '../../domain/planBounds'
import {
  floorPlanReviewTargetLabel,
  hasFloorPlanReviewTargetChanged,
  isFloorPlanReviewComplete,
  MIN_FLOOR_PLAN_REVIEW_NOTE_LENGTH,
} from '../../domain/floorPlanReview'

type Tool = 'select' | 'wall' | 'door' | 'window' | 'entry'
interface TraceImg {
  url: string
  ox: number // 플랜좌표 상 이미지 좌상단
  oy: number
  natW: number
  natH: number
  scale: number
}

export function Editor2D() {
  const svgRef = useRef<SVGSVGElement>(null)
  const plan = useStore((s) => s.plan)
  const projectOrigin = useStore((s) => s.projectOrigin)
  const floorPlanReview = useStore((s) => s.floorPlanReview)
  const completeFloorPlanReview = useStore((s) => s.completeFloorPlanReview)
  const setMode = useStore((s) => s.setMode)
  const placements = useStore((s) => s.placements)
  const productOf = useStore((s) => s.productById)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const addWall = useStore((s) => s.addWall)
  const removeWall = useStore((s) => s.removeWall)
  const updateWall = useStore((s) => s.updateWall)
  const addOpening = useStore((s) => s.addOpening)
  const removeOpening = useStore((s) => s.removeOpening)
  const movePlacement = useStore((s) => s.movePlacement)
  const beginMove = useStore((s) => s.beginMove)
  const confirmMove = useStore((s) => s.confirmMove)

  const [tool, setTool] = useState<Tool>('select')
  const [thickness, setThickness] = useState(120)
  const [chain, setChain] = useState<Pt[]>([])
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [showDims, setShowDims] = useState(true)
  const [selOpening, setSelOpening] = useState<string | null>(null)
  const [trace, setTrace] = useState<TraceImg | null>(null)
  useEffect(
    () => () => {
      if (trace?.url) URL.revokeObjectURL(trace.url)
    },
    [trace?.url]
  )
  const [calib, setCalib] = useState<{ pts: Pt[] }>({ pts: [] })
  const [showDraftGuide, setShowDraftGuide] = useState(true)
  const [showReviewSource, setShowReviewSource] = useState(true)
  const [reviewTarget, setReviewTarget] = useState('')
  const [reviewDecision, setReviewDecision] = useState<FloorPlanReviewDecision | ''>('')
  const [reviewNote, setReviewNote] = useState('')
  const draggingPl = useRef<string | null>(null)
  const dragVertex = useRef<{ wallId: string; end: 'a' | 'b' } | null>(null)

  // viewBox: 전체 도면 + 여백
  const bounds = getPlanBounds(plan)
  const minX = bounds?.minX ?? 0
  const minY = bounds?.minY ?? 0
  const maxX = bounds?.maxX ?? 10000
  const maxY = bounds?.maxY ?? 8000
  const M = 1500
  const reviewTargets: Array<{
    value: string
    kind: FloorPlanReviewTargetKind
    id?: string
    label: string
  }> = [
    ...plan.walls.map((wall) => ({
      value: `wall:${wall.id}`,
      kind: 'wall' as const,
      id: wall.id,
      label: floorPlanReviewTargetLabel(plan, 'wall', wall.id)!,
    })),
    ...plan.rooms.map((room) => ({
      value: `room:${room.id}`,
      kind: 'room' as const,
      id: room.id,
      label: floorPlanReviewTargetLabel(plan, 'room', room.id)!,
    })),
    ...plan.openings.map((opening) => ({
      value: `opening:${opening.id}`,
      kind: 'opening' as const,
      id: opening.id,
      label: floorPlanReviewTargetLabel(plan, 'opening', opening.id)!,
    })),
    {
      value: 'scale',
      kind: 'scale',
      label: floorPlanReviewTargetLabel(plan, 'scale') ?? '실측 치수',
    },
  ]
  const selectedReviewTarget = reviewTargets.find((target) => target.value === reviewTarget)
  const reviewCompleted = isFloorPlanReviewComplete(floorPlanReview)
  const selectedTargetChanged =
    !!floorPlanReview &&
    !!selectedReviewTarget &&
    hasFloorPlanReviewTargetChanged(
      plan,
      floorPlanReview,
      selectedReviewTarget.kind,
      selectedReviewTarget.id
    )
  const reviewCanComplete =
    !!selectedReviewTarget &&
    !!reviewDecision &&
    reviewNote.trim().length >= MIN_FLOOR_PLAN_REVIEW_NOTE_LENGTH &&
    (reviewDecision !== 'modified' || selectedTargetChanged)
  const reviewSelectionEnabled = projectOrigin === 'cv' && !reviewCompleted && showDraftGuide

  function activateSvgTarget(kind: 'wall' | 'room' | 'opening', id: string) {
    if (tool !== 'select') return
    if (reviewSelectionEnabled) setReviewTarget(`${kind}:${id}`)
    if (kind === 'wall') select(`wall:${id}`)
    if (kind === 'opening') setSelOpening(id)
  }

  function targetKeyDown(
    event: React.KeyboardEvent<SVGGElement>,
    kind: 'wall' | 'room' | 'opening',
    id: string
  ) {
    if (tool !== 'select' || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    event.stopPropagation()
    activateSvgTarget(kind, id)
  }

  function toPlan(e: React.PointerEvent | React.MouseEvent): Pt {
    const svg = svgRef.current!
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const inv = ctm.inverse()
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(inv)
    return { x: pt.x, y: pt.y }
  }

  const snapPt = (p: Pt): Pt => ({ x: snapGrid(p.x, 50), y: snapGrid(p.y, 50) })

  function bgClick(e: React.MouseEvent) {
    const p = toPlan(e)
    if (tool === 'wall') {
      const sp = snapPt(p)
      setChain((c) => [...c, sp])
    } else if (tool !== 'select') {
      // 개구부는 벽 클릭에서 처리
    }
  }

  function bgMove(e: React.PointerEvent) {
    const p = toPlan(e)
    setCursor(p)
    if (draggingPl.current) {
      const pl = placements.find((x) => x.id === draggingPl.current)!
      const prod = productOf(pl.productId)
      if (!prod) return
      movePlacement(pl.id, snapGrid(p.x, 25), snapGrid(p.y, 25))
      return
    }
    if (dragVertex.current) {
      const sp = snapPt(p)
      updateWall(dragVertex.current.wallId, { [dragVertex.current.end]: sp })
      return
    }
    if (tool === 'wall') setCursor(snapPt(p))
  }

  function bgUp() {
    if (draggingPl.current) {
      confirmMove()
      draggingPl.current = null
    }
    dragVertex.current = null
  }

  function svgClick(e: React.MouseEvent) {
    const p = toPlan(e)
    if (tool === 'door' || tool === 'window' || tool === 'entry') {
      const opening = createOpeningOnNearestWall(plan, p, tool)
      if (opening) addOpening(opening)
      return
    }
    if (tool === 'select') {
      select(null)
      setSelOpening(null)
    }
  }

  function finishChain() {
    if (chain.length >= 2) {
      for (let i = 0; i < chain.length - 1; i++) addWall(chain[i], chain[i + 1], thickness)
    }
    setChain([chain[chain.length - 1] ?? null].filter(Boolean) as Pt[])
  }

  function cancel() {
    setChain([])
    setTool('select')
  }

  // ── 렌더 헬퍼 ──
  const wallColor = '#3b4046'
  return (
    <div className="ed2d">
      <div className="ed2d-bar">
        <button
          className={tool === 'select' ? 'on' : ''}
          onClick={() => {
            setTool('select')
            setChain([])
          }}
        >
          ⬚ 선택/이동
        </button>
        <button
          className={tool === 'wall' ? 'on' : ''}
          onClick={() => {
            setTool('wall')
            setChain([])
          }}
        >
          ／ 벽 그리기
        </button>
        <select value={thickness} onChange={(e) => setThickness(parseInt(e.target.value))}>
          {[100, 120, 150, 200, 250, 300].map((t) => (
            <option key={t} value={t}>
              두께 {t}mm
            </option>
          ))}
        </select>
        <span className="sep" />
        <button className={tool === 'entry' ? 'on' : ''} onClick={() => setTool('entry')}>
          🚪 출입문
        </button>
        <button className={tool === 'door' ? 'on' : ''} onClick={() => setTool('door')}>
          문
        </button>
        <button className={tool === 'window' ? 'on' : ''} onClick={() => setTool('window')}>
          창문
        </button>
        <span className="sep" />
        <label className="chk">
          <input
            type="checkbox"
            checked={showDims}
            onChange={(e) => setShowDims(e.target.checked)}
          />{' '}
          치수
        </label>
        <TraceControls
          trace={trace}
          calibCount={calib.pts.length}
          onPick={(f) => {
            const url = URL.createObjectURL(f)
            const im = new Image()
            im.onload = () =>
              setTrace({
                url,
                ox: minX,
                oy: minY,
                natW: im.naturalWidth,
                natH: im.naturalHeight,
                scale: Math.max((maxX - minX) / im.naturalWidth, 1),
              })
            im.src = url
          }}
          onCalibClick={() => {
            // 다음 두 번의 클릭을 캘리브레이션으로 사용
            setCalib({ pts: [] })
            const handler = (ev: MouseEvent) => {
              const svg = svgRef.current
              if (!svg) return
              const ctm = svg.getScreenCTM()
              if (!ctm) return
              const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse())
              setCalib((c) => {
                const pts = [...c.pts, { x: pt.x, y: pt.y }]
                if (pts.length >= 2) {
                  window.removeEventListener('click', handler)
                  const mm = parseFloat(
                    prompt('두 점 사이의 실제 길이(mm)? 예) 2400', '2400') ?? ''
                  )
                  if (!isNaN(mm) && mm > 0) setTimeout(() => calibrateWith(pts, mm), 0)
                }
                return { pts }
              })
            }
            window.addEventListener('click', handler)
          }}
        />
        {(chain.length > 0 || tool !== 'select') && <button onClick={cancel}>취소(Esc)</button>}
        {chain.length >= 2 && (
          <button className="primary" onClick={finishChain}>
            벽 완성
          </button>
        )}
      </div>

      {projectOrigin === 'cv' && showDraftGuide && (
        <aside className="ed2d-review-guide" aria-label="변환 초안 검수">
          <div>
            <b>변환 초안 검수</b>
            <span>
              원본에서 벽 연결·방 경계·문·창문·실측 치수를 훑어보고 대표 요소 하나의 판정 근거를
              남기세요.
            </span>
          </div>
          {!reviewCompleted ? (
            <div className="ed2d-review-evidence">
              <label>
                대표 검수 요소
                <select
                  aria-label="대표 검수 요소"
                  value={reviewTarget}
                  onChange={(event) => setReviewTarget(event.target.value)}
                >
                  <option value="">벽·방·문·치수에서 하나 선택</option>
                  {reviewTargets.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>검수 판정</legend>
                <label>
                  <input
                    type="radio"
                    name="floor-plan-review-decision"
                    aria-label="수정 완료"
                    checked={reviewDecision === 'modified'}
                    onChange={() => setReviewDecision('modified')}
                  />
                  수정 완료
                </label>
                <label>
                  <input
                    type="radio"
                    name="floor-plan-review-decision"
                    aria-label="수정 불필요"
                    checked={reviewDecision === 'no-change'}
                    onChange={() => setReviewDecision('no-change')}
                  />
                  수정 불필요
                </label>
              </fieldset>
              <label className="ed2d-review-note">
                검수 근거
                <textarea
                  aria-label="검수 근거"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="예: 대표 외벽의 연결과 길이가 원본과 일치합니다."
                  rows={2}
                />
              </label>
              {reviewDecision === 'modified' && !selectedTargetChanged && (
                <span className="ed2d-review-warning">
                  실제 도면 변경이 있어야 선택할 수 있습니다.
                </span>
              )}
            </div>
          ) : (
            <div className="ed2d-review-summary">
              <b>{floorPlanReview?.evidence?.targetLabel}</b>
              <span>
                {floorPlanReview?.evidence?.decision === 'modified' ? '수정 완료' : '수정 불필요'}
                {' · '}
                {floorPlanReview?.evidence?.note}
              </span>
            </div>
          )}
          <div className="ed2d-review-actions">
            {floorPlanReview?.sourceImageDataUrl && (
              <button
                type="button"
                aria-pressed={showReviewSource}
                onClick={() => setShowReviewSource((visible) => !visible)}
              >
                원본 비교 {showReviewSource ? '끄기' : '켜기'}
              </button>
            )}
            {!reviewCompleted && (
              <button
                type="button"
                className="primary"
                disabled={!reviewCanComplete}
                onClick={() => {
                  if (!selectedReviewTarget || !reviewDecision) return
                  const completed = completeFloorPlanReview({
                    targetKind: selectedReviewTarget.kind,
                    targetId: selectedReviewTarget.id,
                    decision: reviewDecision,
                    note: reviewNote,
                  })
                  if (completed) setMode('3d')
                }}
              >
                검수 근거 저장하고 3D 보기
              </button>
            )}
            {reviewCompleted && <span className="ed2d-review-done">✓ 검수 완료</span>}
            {reviewCompleted && (
              <button
                className="ed2d-review-close"
                aria-label="변환 초안 검수 닫기"
                onClick={() => setShowDraftGuide(false)}
              >
                ×
              </button>
            )}
          </div>
        </aside>
      )}

      <svg
        ref={svgRef}
        className={`ed2d-svg t-${tool}`}
        viewBox={`${minX - M} ${minY - M} ${maxX - minX + M * 2} ${maxY - minY + M * 2}`}
        onClick={(e) => {
          if (calib.pts.length > 0 && calib.pts.length < 2) return // 캘리브레이션 중 글로벌 핸들러가 처리
          svgClick(e)
        }}
        onDoubleClick={() => {}}
        onContextMenu={(e) => {
          e.preventDefault()
          finishChain()
        }}
        onPointerMove={bgMove}
        onPointerUp={bgUp}
        onPointerDown={bgClick as unknown as React.MouseEventHandler<SVGSVGElement>}
      >
        {/* 트레이싱 이미지 */}
        {trace && (
          <image
            href={trace.url}
            x={trace.ox}
            y={trace.oy}
            width={trace.natW * trace.scale}
            height={trace.natH * trace.scale}
            opacity={0.55}
            preserveAspectRatio="none"
          />
        )}

        {/* 방 폴리곤 */}
        {plan.rooms.map((r) => {
          const isReviewTarget =
            selectedReviewTarget?.kind === 'room' && selectedReviewTarget.id === r.id
          const label = floorPlanReviewTargetLabel(plan, 'room', r.id) ?? `방 · ${r.name}`
          return (
            <g
              key={r.id}
              className="ed2d-interactive"
              data-review-highlight={isReviewTarget ? 'true' : undefined}
              role="button"
              tabIndex={tool === 'select' && reviewSelectionEnabled ? 0 : -1}
              aria-disabled={tool !== 'select' || !reviewSelectionEnabled}
              aria-label={label}
              aria-pressed={isReviewTarget}
              onClick={(event) => {
                if (tool !== 'select' || !reviewSelectionEnabled) return
                event.stopPropagation()
                activateSvgTarget('room', r.id)
              }}
              onKeyDown={(event) => targetKeyDown(event, 'room', r.id)}
            >
              <polygon
                points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="#f4f6f8"
                stroke={isReviewTarget ? '#e58a00' : '#dfe4ea'}
                strokeWidth={isReviewTarget ? 70 : 20}
              />
              <polygon
                className="ed2d-focus-ring"
                points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                strokeWidth={90}
              />
              <text
                x={r.polygon.reduce((a, p) => a + p.x, 0) / r.polygon.length}
                y={r.polygon.reduce((a, p) => a + p.y, 0) / r.polygon.length}
                textAnchor="middle"
                className="room-label"
              >
                {r.name}
              </text>
            </g>
          )
        })}

        {floorPlanReview?.sourceImageDataUrl && showReviewSource && (
          <image
            data-testid="floorplan-review-source"
            data-review-highlight={selectedReviewTarget?.kind === 'scale' ? 'true' : undefined}
            href={floorPlanReview.sourceImageDataUrl}
            x={0}
            y={0}
            width={floorPlanReview.sourceWidth * floorPlanReview.mmPerPx}
            height={floorPlanReview.sourceHeight * floorPlanReview.mmPerPx}
            opacity={0.42}
            preserveAspectRatio="none"
            pointerEvents="none"
          />
        )}

        {/* 벽 */}
        {plan.walls.map((w) => {
          const L = wallLength(w)
          const isReviewTarget =
            selectedReviewTarget?.kind === 'wall' && selectedReviewTarget.id === w.id
          const label = floorPlanReviewTargetLabel(plan, 'wall', w.id) ?? `벽 ${w.id}`
          return (
            <g
              key={w.id}
              className="ed2d-interactive"
              data-review-highlight={isReviewTarget ? 'true' : undefined}
              role="button"
              tabIndex={tool === 'select' ? 0 : -1}
              aria-disabled={tool !== 'select'}
              aria-label={label}
              aria-pressed={isReviewTarget || selectedId === `wall:${w.id}`}
              onClick={(event) => {
                // 선택 도구에서만 벽 선택 — 문/창문 배치 클릭은 svg까지 전파된다.
                if (tool !== 'select') return
                event.stopPropagation()
                activateSvgTarget('wall', w.id)
              }}
              onKeyDown={(event) => targetKeyDown(event, 'wall', w.id)}
            >
              <line
                className="ed2d-focus-ring"
                x1={w.a.x}
                y1={w.a.y}
                x2={w.b.x}
                y2={w.b.y}
                strokeWidth={Math.max(w.thickness + 140, 320)}
                strokeLinecap="round"
              />
              <line
                x1={w.a.x}
                y1={w.a.y}
                x2={w.b.x}
                y2={w.b.y}
                stroke={isReviewTarget ? '#e58a00' : wallColor}
                strokeWidth={isReviewTarget ? w.thickness + 80 : w.thickness}
                strokeLinecap="butt"
              />
              <line
                x1={w.a.x}
                y1={w.a.y}
                x2={w.b.x}
                y2={w.b.y}
                stroke="transparent"
                strokeWidth={Math.max(w.thickness, 320)}
                className="ed2d-hit-target"
                style={{ cursor: 'pointer' }}
              />
              {/* 끝점 핸들 (선택 시) */}
              {selectedId === `wall:${w.id}` &&
                (['a', 'b'] as const).map((k) => (
                  <circle
                    key={k}
                    cx={w[k].x}
                    cy={w[k].y}
                    r={90}
                    fill="#ffd54a"
                    stroke="#b8860b"
                    strokeWidth={30}
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      dragVertex.current = { wallId: w.id, end: k }
                    }}
                  />
                ))}
              {selectedId === `wall:${w.id}` && (
                <text
                  x={(w.a.x + w.b.x) / 2}
                  y={(w.a.y + w.b.y) / 2 - w.thickness / 2 - 60}
                  textAnchor="middle"
                  className="dim-label sel"
                >
                  {L.toFixed(0)}mm ▸Del 삭제
                </text>
              )}
              {showDims && selectedId !== `wall:${w.id}` && (
                <text
                  x={(w.a.x + w.b.x) / 2}
                  y={(w.a.y + w.b.y) / 2 - w.thickness / 2 - 60}
                  textAnchor="middle"
                  className="dim-label"
                >
                  {L.toFixed(0)}
                </text>
              )}
            </g>
          )
        })}
        {selectedId?.startsWith('wall:') && (
          <DeleteHint onDelete={() => removeWall(selectedId.slice(5))} label="선택된 벽 삭제" />
        )}

        {/* 개구부 */}
        {plan.openings.map((o) => {
          const w = plan.walls.find((x) => x.id === o.wallId)
          if (!w) return null
          const { cx, cy } = projectOnSegment(
            (() => {
              const len = wallLength(w) || 1
              const t = o.offset + o.width / 2 / len
              return {
                x: w.a.x + (w.b.x - w.a.x) * Math.min(1, t),
                y: w.a.y + (w.b.y - w.a.y) * Math.min(1, t),
              }
            })(),
            w.a,
            w.b
          )
          void cx
          void cy
          const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)
          const midT = Math.min(1, Math.max(0, (o.offset + o.width / 2) / (wallLength(w) || 1)))
          const mx = w.a.x + (w.b.x - w.a.x) * midT
          const my = w.a.y + (w.b.y - w.a.y) * midT
          const isSel = selOpening === o.id
          const isReviewTarget =
            selectedReviewTarget?.kind === 'opening' && selectedReviewTarget.id === o.id
          const label = floorPlanReviewTargetLabel(plan, 'opening', o.id) ?? `개구부 ${o.id}`
          const hitPadding = Math.max(80, w.thickness / 2)
          const hitHeight =
            o.type === 'window'
              ? Math.max(w.thickness + hitPadding * 2, 320)
              : o.width + w.thickness / 2 + hitPadding
          return (
            <g
              key={o.id}
              className="ed2d-interactive"
              data-testid={`opening-${o.id}`}
              data-review-highlight={isReviewTarget ? 'true' : undefined}
              transform={`translate(${mx},${my}) rotate(${(ang * 180) / Math.PI})`}
              role="button"
              tabIndex={tool === 'select' ? 0 : -1}
              aria-disabled={tool !== 'select'}
              aria-label={label}
              aria-pressed={isReviewTarget || isSel}
              onClick={(event) => {
                event.stopPropagation()
                if (tool === 'select') activateSvgTarget('opening', o.id)
                else setSelOpening(o.id)
              }}
              onKeyDown={(event) => targetKeyDown(event, 'opening', o.id)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                className="ed2d-hit-target"
                x={-o.width / 2 - hitPadding}
                y={-w.thickness / 2 - hitPadding}
                width={o.width + hitPadding * 2}
                height={hitHeight}
                fill="transparent"
              />
              <rect
                className="ed2d-focus-ring"
                x={-o.width / 2 - hitPadding}
                y={-w.thickness / 2 - hitPadding}
                width={o.width + hitPadding * 2}
                height={hitHeight}
                rx={60}
                fill="none"
                strokeWidth={60}
              />
              <rect
                x={-o.width / 2}
                y={-w.thickness / 2 - 10}
                width={o.width}
                height={w.thickness + 20}
                fill="#fff"
                stroke={isReviewTarget ? '#e58a00' : isSel ? '#ff9800' : '#c9ced4'}
                strokeWidth={isReviewTarget ? 40 : isSel ? 24 : 12}
              />
              {o.type === 'window' && (
                <>
                  <line
                    x1={-o.width / 2}
                    y1={0}
                    x2={o.width / 2}
                    y2={0}
                    stroke="#4a90c2"
                    strokeWidth={16}
                  />
                  <line
                    x1={-o.width / 2}
                    y1={-w.thickness / 4}
                    x2={o.width / 2}
                    y2={-w.thickness / 4}
                    stroke="#7db4d8"
                    strokeWidth={8}
                  />
                  <line
                    x1={-o.width / 2}
                    y1={w.thickness / 4}
                    x2={o.width / 2}
                    y2={w.thickness / 4}
                    stroke="#7db4d8"
                    strokeWidth={8}
                  />
                </>
              )}
              {(o.type === 'door' || o.type === 'entry') && (
                <>
                  <line
                    x1={-o.width / 2}
                    y1={0}
                    x2={-o.width / 2}
                    y2={o.width}
                    stroke="#5a4634"
                    strokeWidth={14}
                  />
                  <path
                    d={`M ${-o.width / 2} ${o.width} A ${o.width} ${o.width} 0 0 1 ${o.width / 2} 0`}
                    fill="none"
                    stroke={o.type === 'entry' ? '#b06a3b' : '#8a8f95'}
                    strokeWidth={10}
                  />
                </>
              )}
            </g>
          )
        })}
        {selOpening && (
          <DeleteHint
            onDelete={() => {
              removeOpening(selOpening)
              setSelOpening(null)
            }}
            label="선택된 개구부 삭제"
          />
        )}

        {/* 가구 탑뷰 */}
        {placements.map((pl) => {
          const prod = productOf(pl.productId)
          if (!prod) return null
          const isSel = selectedId === pl.id
          return (
            <rect
              key={pl.id}
              x={-prod.dims.w / 2}
              y={-prod.dims.d / 2}
              width={prod.dims.w}
              height={prod.dims.d}
              rx={40}
              transform={`translate(${pl.pos.x},${pl.pos.z}) rotate(${pl.rotY})`}
              fill={isSel ? '#ffd54a66' : '#4a90c222'}
              stroke={isSel ? '#ff9800' : '#4a90c2'}
              strokeWidth={isSel ? 30 : 16}
              style={{ cursor: 'move', pointerEvents: tool === 'select' ? 'auto' : 'none' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                select(pl.id)
                beginMove(pl.id, {
                  x: pl.pos.x,
                  z: pl.pos.z,
                  rotY: pl.rotY,
                  roomId: pl.roomId,
                })
                draggingPl.current = pl.id
              }}
            />
          )
        })}

        {/* 벽 그리기 미리보기 */}
        {tool === 'wall' && (
          <g>
            {chain.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={70} fill="#ff9800" />
            ))}
            {chain.map((p, i) =>
              i < chain.length - 1 ? (
                <line
                  key={`l${i}`}
                  x1={p.x}
                  y1={p.y}
                  x2={chain[i + 1].x}
                  y2={chain[i + 1].y}
                  stroke="#ff9800"
                  strokeWidth={thickness}
                  opacity={0.85}
                />
              ) : null
            )}
            {cursor && chain.length > 0 && (
              <line
                x1={chain[chain.length - 1].x}
                y1={chain[chain.length - 1].y}
                x2={cursor.x}
                y2={cursor.y}
                stroke="#ffb74d"
                strokeWidth={thickness}
                opacity={0.5}
              />
            )}
          </g>
        )}

        {/* 캘리브레이션 점 */}
        {calib.pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={110} fill="none" stroke="#e91e63" strokeWidth={26} />
        ))}
        {trace && calib.pts.length === 0 && (
          <text x={minX + 200} y={minY - 500} className="dim-label" fontSize={420}>
            ⓘ 스케일 보정: 도면의 알고 있는 치수 양끝을 차례로 클릭하세요
          </text>
        )}
      </svg>

      {selOpening && <OpeningPanel id={selOpening} />}
    </div>
  )

  function calibrateWith(pts: Pt[], mm: number) {
    if (!trace) return
    const [a, b] = pts
    const dPx = Math.hypot(b.x - a.x, b.y - a.y) / trace.scale
    if (dPx < 5) return
    const ns = mm / dPx
    setTrace({
      ...trace,
      scale: ns,
      ox: a.x - ((a.x - trace.ox) / trace.scale) * ns,
      oy: a.y - ((a.y - trace.oy) / trace.scale) * ns,
    })
    setCalib({ pts: [] })
  }
}

function DeleteHint({ onDelete, label }: { onDelete: () => void; label: string }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="floating-hint">
      {label}
      {!confirming ? (
        <button onClick={() => setConfirming(true)}>삭제…</button>
      ) : (
        <>
          <button className="danger" onClick={onDelete}>
            확인
          </button>
          <button onClick={() => setConfirming(false)}>아니오</button>
        </>
      )}
    </div>
  )
}

function OpeningPanel({ id }: { id: string }) {
  const op = useStore((s) => s.plan.openings.find((o) => o.id === id))
  const updateOpening = useStore((s) => s.updateOpening)
  if (!op) return null
  return (
    <div className="floating-panel">
      <b>{op.type === 'window' ? '창문' : op.type === 'entry' ? '출입문' : '문'}</b> · 폭{' '}
      <input
        type="number"
        step={50}
        value={op.width}
        style={{ width: 90 }}
        onChange={(e) => updateOpening(id, { width: parseInt(e.target.value) || op.width })}
      />
      mm
      {op.type === 'window' && (
        <>
          {' '}
          · 하단높이{' '}
          <input
            type="number"
            step={50}
            value={op.sill}
            style={{ width: 90 }}
            onChange={(e) => updateOpening(id, { sill: parseInt(e.target.value) || 0 })}
          />
          mm
        </>
      )}
    </div>
  )
}

function TraceControls({
  trace,
  calibCount,
  onPick,
  onCalibClick,
}: {
  trace: TraceImg | null
  calibCount: number
  onPick: (f: File) => void
  onCalibClick: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        title="도면 이미지를 배경에 깔고 따라 그립니다"
      >
        🖼️ 트레이싱 {trace ? '●' : ''}
      </button>
      <input
        hidden
        type="file"
        accept="image/*"
        ref={fileRef}
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
      {trace && (
        <button onClick={onCalibClick} title="이미지 위 실측 구간 두 점 클릭 → 실제 길이 입력">
          📐 스케일 보정{calibCount > 0 ? ` (${calibCount}/2)` : ''}
        </button>
      )}
    </>
  )
}
