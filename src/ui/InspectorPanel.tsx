// ─────────────────────────────────────────────────────────────
// 우측 인스펙터 — 선택 제품 속성(치수·색상·회전·높이) / 프로젝트 정보
// ─────────────────────────────────────────────────────────────
import { useStore } from '../store/store'
import { polygonArea } from '../engine/geom'

export function InspectorPanel() {
  const selectedId = useStore((s) => s.selectedId)
  const placement = useStore((s) => s.placements.find((p) => p.id === s.selectedId))
  const product = useStore((s) => (selectedId ? s.productById(selectedId ? s.placements.find((p) => p.id === selectedId)?.productId ?? '' : '') : undefined))
  const plan = useStore((s) => s.plan)
  const updatePlacement = useStore((s) => s.updatePlacement)
  const removePlacement = useStore((s) => s.removePlacement)
  const duplicatePlacement = useStore((s) => s.duplicatePlacement)

  if (!placement || !product) {
    const totalM2 = plan.rooms.reduce((a, r) => a + polygonArea(r.polygon), 0) / 1_000_000
    return (
      <div className="inspector">
        <h4>선택된 항목 없음</h4>
        <p className="hint">
          카탈로그에서 제품을 클릭하면 3D에 배치됩니다.
          <br />
          <br />
          <b>조작법</b>
          <br />• 드래그: 이동 (25mm 그리드, 벽부착 제품은 벽 자석)
          <br />• R: 15° 회전 · Shift+R: -15° 회전
          <br />• Delete: 삭제 · Ctrl+Z: 되돌리기
        </p>
        <div className="stats">
          <div>방 개수</div>
          <b>{plan.rooms.length}개</b>
          <div>연면적</div>
          <b>{totalM2.toFixed(1)}㎡ ({(totalM2 / 3.3058).toFixed(1)}평)</b>
          <div>벽 높이</div>
          <b>{plan.wallHeight}mm</b>
          <div>배치 제품</div>
          <b>{useStore.getState().placements.length}개</b>
        </div>
      </div>
    )
  }

  const room = plan.rooms.find((r) => r.id === placement.roomId)
  const elev = placement.elevationOverride ?? product.defaultElevation ?? 0

  return (
    <div className="inspector">
      <h4>{product.name}</h4>
      {product.note && <p className="hint">{product.note}</p>}
      <table className="dims">
        <tbody>
          <tr>
            <td>가로</td>
            <td>{product.dims.w} mm</td>
          </tr>
          <tr>
            <td>세로(깊이)</td>
            <td>{product.dims.d} mm</td>
          </tr>
          <tr>
            <td>높이</td>
            <td>{product.dims.h} mm</td>
          </tr>
          <tr>
            <td>설치 높이</td>
            <td>{elev} mm</td>
          </tr>
          <tr>
            <td>현재 방</td>
            <td>{room?.name ?? '-'}</td>
          </tr>
        </tbody>
      </table>

      {product.colorways && product.colorways.length > 0 && (
        <>
          <label className="lbl">색상</label>
          <div className="swatches">
            {product.colorways.map((c) => (
              <button
                key={c}
                className={`sw${placement.colorway === c ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => updatePlacement(placement.id, { colorway: c })}
              />
            ))}
          </div>
        </>
      )}

      <label className="lbl">회전 ({Math.round(placement.rotY)}°)</label>
      <div className="rowbtns">
        <button onClick={() => updatePlacement(placement.id, { rotY: placement.rotY - 90 })}>-90°</button>
        <button onClick={() => updatePlacement(placement.id, { rotY: placement.rotY - 15 })}>-15°</button>
        <button onClick={() => updatePlacement(placement.id, { rotY: placement.rotY + 15 })}>+15°</button>
        <button onClick={() => updatePlacement(placement.id, { rotY: placement.rotY + 90 })}>+90°</button>
      </div>

      {(product.mount === 'wall-mount' || product.mount === 'ceiling') && (
        <>
          <label className="lbl">
            설치 높이 — 바닥에서 {Math.round(product.mount === 'ceiling' ? plan.wallHeight + (placement.elevationOverride ?? 0) : elev)}mm
          </label>
          <input
            type="range"
            min={0}
            max={plan.wallHeight}
            step={50}
            value={elev}
            onChange={(e) => updatePlacement(placement.id, { elevationOverride: parseInt(e.target.value) })}
          />
        </>
      )}

      <label className="lbl">위치 (mm)</label>
      <div className="row3">
        <input
          type="number"
          step={10}
          value={Math.round(placement.pos.x)}
          onChange={(e) => updatePlacement(placement.id, { pos: { ...placement.pos, x: parseInt(e.target.value) || 0 } })}
        />
        <input
          type="number"
          step={10}
          value={Math.round(placement.pos.z)}
          onChange={(e) => updatePlacement(placement.id, { pos: { ...placement.pos, z: parseInt(e.target.value) || 0 } })}
        />
      </div>

      <div className="rowbtns" style={{ marginTop: 12 }}>
        <button onClick={() => duplicatePlacement(placement.id)}>복제</button>
        <button className="danger" onClick={() => removePlacement(placement.id)}>
          삭제
        </button>
      </div>
    </div>
  )
}
