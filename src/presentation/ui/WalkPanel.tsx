// ─────────────────────────────────────────────────────────────
// 워크스루 설정 패널 — 신장/몸무게 슬라이더 + 1인칭/3인칭 전환
// ─────────────────────────────────────────────────────────────
import { useStore } from '../AppRuntimeContext'
import { characterRadius, WALK_EYE_RATIO } from '../../domain/walkProfile'

export function WalkPanel() {
  const walkConfig = useStore((s) => s.walkConfig)
  const setWalkConfig = useStore((s) => s.setWalkConfig)
  const walkView = useStore((s) => s.walkView)
  const setWalkView = useStore((s) => s.setWalkView)

  const eyeH = Math.round(walkConfig.heightCm * 10 * WALK_EYE_RATIO)
  const radius = Math.round(characterRadius(walkConfig.weightKg))

  return (
    <div className="walk-panel">
      <div className="wp-title">🚶 워크스루 설정</div>
      <label>
        신장 <b>{walkConfig.heightCm}cm</b>
        <input
          type="range"
          min={140}
          max={200}
          step={5}
          value={walkConfig.heightCm}
          onChange={(e) => setWalkConfig({ heightCm: parseInt(e.target.value) })}
        />
      </label>
      <label>
        몸무게 <b>{walkConfig.weightKg}kg</b>
        <input
          type="range"
          min={40}
          max={120}
          step={5}
          value={walkConfig.weightKg}
          onChange={(e) => setWalkConfig({ weightKg: parseInt(e.target.value) })}
        />
      </label>
      <div className="wp-stats">
        눈높이 {eyeH}mm · 캐릭터 반경 {radius}mm
      </div>
      <div className="wp-views">
        <button className={walkView === 'fp' ? 'on' : ''} onClick={() => setWalkView('fp')}>
          1인칭
        </button>
        <button className={walkView === 'tp' ? 'on' : ''} onClick={() => setWalkView('tp')}>
          3인칭
        </button>
      </div>
      <div className="wp-hint">WASD 이동 · 드래그 시선 · Shift 달리기</div>
    </div>
  )
}
