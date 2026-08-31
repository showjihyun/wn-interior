import { useRef, useState } from 'react'
import { useAppRuntime, useStore, useStoreApi } from '../AppRuntimeContext'
import { DEFAULT_AI_MODEL, resolveAiModel } from '../../application/aiSettings'
import { FloorPlanAnalysisError } from '../../application/analyzeFloorPlan'
import { exportProjectDocument, importProjectDocument } from '../../application/projectDocument'
import { PlanVisionModal as CvModal } from './PlanVisionModal'
import { ProjectsModal } from './ProjectsModal'

function analysisErrorMessage(error: FloorPlanAnalysisError): string {
  const messages: Record<FloorPlanAnalysisError['code'], string> = {
    unauthorized: 'API 키가 올바르지 않습니다 — ⚙️ 설정에서 키를 다시 확인하세요',
    'quota-exhausted': 'API 크레딧이 부족합니다 — 크레딧을 충전하거나 다른 모델을 선택하세요',
    'rate-limited': '요청 한도를 초과했습니다 — 잠시 후 다시 시도하세요',
    unavailable: 'AI 서비스에 연결할 수 없습니다 — 네트워크와 엔드포인트를 확인하세요',
    'invalid-response': '응답 JSON을 파싱할 수 없습니다',
    'invalid-floor-plan': '응답을 유효한 도면으로 변환할 수 없습니다',
  }
  return messages[error.code]
}

function Btn({
  onClick,
  children,
  active,
  danger,
  primary,
  title,
}: {
  onClick?: () => void
  children: React.ReactNode
  active?: boolean
  danger?: boolean
  primary?: boolean
  title?: string
}) {
  return (
    <button
      className={`tbtn${active ? ' active' : ''}${danger ? ' danger' : ''}${primary ? ' tbtn-core' : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

export function Toolbar() {
  const { sceneSurface, textFileExporter } = useAppRuntime()
  const store = useStoreApi()
  const s = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [setOpen, setSetOpen] = useState(false)
  const [varOpen, setVarOpen] = useState(false)
  const [cvOpen, setCvOpen] = useState(false)
  const [projOpen, setProjOpen] = useState(false)

  function exportJson() {
    const proj = s.exportProject()
    textFileExporter.download(
      exportProjectDocument(proj),
      `${proj.name || 'homeplan'}.json`,
      'application/json;charset=utf-8'
    )
  }

  function importJson(f: File) {
    f.text().then((txt) => {
      try {
        s.loadProject(importProjectDocument(txt))
        store.getState().showToast('프로젝트를 불러왔습니다', 'info')
      } catch {
        store.getState().showToast('JSON 파싱 실패 — 올바른 프로젝트 파일이 아닙니다', 'error')
      }
    })
  }

  return (
    <div className="toolbar">
      <div className="brand">
        🏠 홈플랜<span>3D</span>
      </div>

      <div className="seg">
        <Btn active={s.mode === '3d'} onClick={() => s.setMode('3d')}>
          3D 배치
        </Btn>
        <Btn active={s.mode === '2d'} onClick={() => s.setMode('2d')}>
          2D 도면편집
        </Btn>
      </div>

      <Btn
        primary
        onClick={() => setCvOpen(true)}
        title="평면도 이미지를 업로드해 축척을 확인하고 2D·3D 공간으로 변환"
      >
        평면도 업로드 → 3D
      </Btn>

      {s.mode === '3d' && (
        <div className="seg">
          <Btn
            active={s.viewPreset === 'iso'}
            onClick={() => s.setViewPreset('iso')}
            title="아이소메트릭 뷰"
          >
            아이소
          </Btn>
          <Btn active={s.viewPreset === 'top'} onClick={() => s.setViewPreset('top')} title="탑뷰">
            탑뷰
          </Btn>
          <Btn
            active={s.viewPreset === 'walk'}
            onClick={() => s.setViewPreset('walk')}
            title="1인칭: 드래그 시선 · WASD 이동 · Shift 달리기"
          >
            🚶 워크스루
          </Btn>
        </div>
      )}

      <div className="sep" />
      <Btn onClick={s.undo} title="되돌리기 (Ctrl+Z)">
        ↩ 되돌리기
      </Btn>
      <Btn onClick={s.redo} title="다시 실행 (Ctrl+Y)">
        ↪ 다시실행
      </Btn>

      <div className="sep" />
      <Btn onClick={() => setVarOpen(true)} title="현재 배치를 저장하고 나중에 불러와 비교">
        🗂 배치안 비교
      </Btn>
      <Btn onClick={() => sceneSurface.downloadScreenshot()} title="PNG 저장">
        📷 스크린샷
      </Btn>
      <Btn onClick={exportJson}>💾 내보내기</Btn>
      <Btn onClick={() => fileRef.current?.click()}>📂 불러오기</Btn>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
      />

      <div className="grow" />
      <label className="light-ctl" title="씬 조명 강도 (오늘의집 렌더링 권장: 햇빛 0.3~1.0)">
        ☀
        <input
          type="range"
          min={0.2}
          max={2}
          step={0.1}
          value={s.lightIntensity}
          onChange={(e) => s.setLightIntensity(parseFloat(e.target.value))}
        />
      </label>
      <Btn onClick={() => setProjOpen(true)} title="세션별 프로젝트 관리">
        📁 프로젝트
      </Btn>
      <Btn active={s.showDims3D} onClick={s.toggleDims3D} title="3D 외곽 가로·세로 실측 치수선">
        📐 치수선
      </Btn>
      <Btn onClick={() => setAiOpen(true)} title="도면 이미지를 AI로 해석">
        ✨ AI 도면 해석
      </Btn>
      <Btn onClick={s.resetToSample}>샘플 초기화</Btn>
      <Btn onClick={() => setSetOpen(true)}>⚙️</Btn>

      {aiOpen && <AiModal onClose={() => setAiOpen(false)} />}
      {setOpen && <SettingsModal onClose={() => setSetOpen(false)} />}
      {varOpen && <VariantsModal onClose={() => setVarOpen(false)} />}
      {cvOpen && <CvModal onClose={() => setCvOpen(false)} />}
      {projOpen && <ProjectsModal onClose={() => setProjOpen(false)} />}
    </div>
  )
}

/** 배치안 A/B 비교 — 썸네일 스냅샷 저장/적용/삭제 */
function VariantsModal({ onClose }: { onClose: () => void }) {
  const { sceneSurface } = useAppRuntime()
  const variants = useStore((s) => s.variants)
  const saveVariant = useStore((s) => s.saveVariant)
  const applyVariant = useStore((s) => s.applyVariant)
  const removeVariant = useStore((s) => s.removeVariant)
  const placementsCount = useStore((s) => s.placements.length)
  const [name, setName] = useState('')

  function save() {
    saveVariant(name.trim(), sceneSurface.captureThumb())
    setName('')
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🗂 배치안 비교</h3>
        <p className="hint">
          현재 배치({placementsCount}개 제품)를 저장해 두고, 여러 안을 오가며 비교하세요. 적용은
          되돌리기(Ctrl+Z)로 취소할 수 있습니다.
        </p>
        <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
          <input
            placeholder="배치안 이름 (예: A안 — 소파 남벽)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="primary" onClick={save}>
            현재 상태 저장
          </button>
        </div>
        {variants.length === 0 && <p className="hint">저장된 배치안이 없습니다.</p>}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 10,
          }}
        >
          {variants.map((v, i) => (
            <div key={v.id} className="variant-card">
              {v.thumb ? (
                <img src={v.thumb} alt={v.name} />
              ) : (
                <div className="vthumb-empty">{i + 1}</div>
              )}
              <b>{v.name}</b>
              <span>{v.placements.length}개 제품</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => applyVariant(v.id)}>적용</button>
                <button className="danger" onClick={() => removeVariant(v.id)}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

function AiModal({ onClose }: { onClose: () => void }) {
  const { analyzeFloorPlan } = useAppRuntime()
  const store = useStoreApi()
  const ai = useStore((s) => s.ai)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [rawJson, setRawJson] = useState<string | null>(null)

  function pick(f: File) {
    const r = new FileReader()
    r.onload = () => setDataUrl(r.result as string)
    r.readAsDataURL(f)
  }

  async function run() {
    if (!dataUrl) return
    const st = store.getState()
    if (!ai.apiKey.trim()) {
      st.showToast('API 키가 설정되지 않았습니다. ⚙️ 설정에서 입력하세요', 'error')
      setStatus('API 키 미설정 — ⚙️ 설정에서 입력하세요')
      return
    }
    setStatus('해석 중… (수십 초 소요)')
    try {
      const result = await analyzeFloorPlan.execute(ai, dataUrl, (progress) => {
        setStatus(
          `한도 초과(429) — ${progress.retryAfterMs / 1000}초 후 재시도… (${progress.attempt}/${progress.maxRetries})`
        )
      })
      setRawJson(result.raw)
      st.loadProject({
        version: 1,
        name: 'AI 해석 도면',
        origin: 'ai',
        plan: result.plan,
        placements: [],
        customProducts: st.customProducts,
        createdAt: '',
        updatedAt: '',
      })
      st.setMode('2d')
      setStatus('완료! 2D 편집기에서 치수를 보정하세요.')
      setTimeout(onClose, 1200)
    } catch (e) {
      const msg =
        e instanceof FloorPlanAnalysisError ? analysisErrorMessage(e) : (e as Error).message
      if (e instanceof FloorPlanAnalysisError && e.raw) setRawJson(e.raw)
      st.showToast(`AI 해석 실패: ${msg}`, 'error')
      setStatus(
        e instanceof FloorPlanAnalysisError && e.raw
          ? `파싱 실패: ${msg} — 원본 JSON을 확인해 수동 보정할 수 있습니다.`
          : `실패: ${msg}`
      )
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>✨ AI 도면 해석 (OpenAI 호환 Vision)</h3>
        <p className="hint">
          치수가 적힌 평면도 이미지를 올리면 벽·문·창문·방 구조를 JSON으로 변환합니다. 결과는 반드시{' '}
          <b>2D 편집기에서 보정</b>하세요. (아키스케치류 상용 서비스도 표준오차 50~80mm)
        </p>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
        />
        {dataUrl && (
          <img
            src={dataUrl}
            alt="도면 미리보기"
            style={{ maxWidth: '100%', maxHeight: 200, marginTop: 8, border: '1px solid #333' }}
          />
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="primary" disabled={!dataUrl} onClick={run}>
            해석 시작
          </button>
          <button onClick={onClose}>닫기</button>
        </div>
        {status && <p className="status">{status}</p>}
        {rawJson && status.includes('파싱 실패') && (
          <textarea readOnly value={rawJson} rows={6} style={{ width: '100%', marginTop: 8 }} />
        )}
      </div>
    </div>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const ai = useStore((s) => s.ai)
  const setAi = useStore((s) => s.setAi)
  const [form, setForm] = useState({ ...ai, model: resolveAiModel(ai.model) })

  function save() {
    setAi(form)
    onClose()
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ AI 설정 (OpenAI 호환)</h3>
        <div className="presets">
          <button
            onClick={() =>
              setForm({
                ...form,
                baseUrl: 'https://openrouter.ai/api/v1',
                model: DEFAULT_AI_MODEL,
              })
            }
            title={`OpenRouter — ${DEFAULT_AI_MODEL}`}
          >
            Gemma 4 무료
          </button>
          <button
            onClick={() =>
              setForm({ ...form, baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' })
            }
            title="OpenRouter — openai/gpt-4o"
          >
            OpenRouter · GPT-4o
          </button>
          <button
            onClick={() =>
              setForm({ ...form, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' })
            }
            title="OpenAI 공식 API"
          >
            OpenAI 직접
          </button>
        </div>
        <label>
          Base URL
          <input
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label>
          모델
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="gpt-4o"
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </label>
        <p className="hint">
          키는 브라우저(localStorage)에만 저장되며 외부로 전송되지 않습니다. LM Studio/Ollama 등
          로컬 엔드포인트도 가능.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={save}>
            저장
          </button>
          <button onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}
