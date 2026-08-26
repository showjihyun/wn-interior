import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { normalizeAiPlan } from '../ai/normalizePlan'
import { buildChatRequest, parseChatResponse } from '../ai/client'
import { PlanVisionModal as CvModal } from './PlanVisionModal'
import { ProjectsModal } from './ProjectsModal'

function Btn({
  onClick,
  children,
  active,
  danger,
  title,
}: {
  onClick?: () => void
  children: React.ReactNode
  active?: boolean
  danger?: boolean
  title?: string
}) {
  return (
    <button className={`tbtn${active ? ' active' : ''}${danger ? ' danger' : ''}`} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

export function Toolbar() {
  const s = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [setOpen, setSetOpen] = useState(false)
  const [varOpen, setVarOpen] = useState(false)
  const [cvOpen, setCvOpen] = useState(false)
  const [projOpen, setProjOpen] = useState(false)

  function exportJson() {
    const proj = s.exportProject()
    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${proj.name || 'homeplan'}.json`
    a.click()
  }

  function importJson(f: File) {
    f.text().then((txt) => {
      try {
        s.loadProject(JSON.parse(txt))
        useStore.getState().showToast('프로젝트를 불러왔습니다', 'info')
      } catch {
        useStore.getState().showToast('JSON 파싱 실패 — 올바른 프로젝트 파일이 아닙니다', 'error')
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

      {s.mode === '3d' && (
        <div className="seg">
          <Btn active={s.viewPreset === 'iso'} onClick={() => s.setViewPreset('iso')} title="아이소메트릭 뷰">
            아이소
          </Btn>
          <Btn active={s.viewPreset === 'top'} onClick={() => s.setViewPreset('top')} title="탑뷰">
            탑뷰
          </Btn>
          <Btn active={s.viewPreset === 'walk'} onClick={() => s.setViewPreset('walk')} title="1인칭: 드래그 시선 · WASD 이동 · Shift 달리기">
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
      <Btn onClick={() => screenshot()} title="PNG 저장">
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
      <Btn onClick={() => setCvOpen(true)} title="이미지 처리로 벽·방·문을 자동 검출 (LLM 불필요)">
        🧮 도면 자동 변환
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
  const variants = useStore((s) => s.variants)
  const saveVariant = useStore((s) => s.saveVariant)
  const applyVariant = useStore((s) => s.applyVariant)
  const removeVariant = useStore((s) => s.removeVariant)
  const placementsCount = useStore((s) => s.placements.length)
  const [name, setName] = useState('')

  function save() {
    import('../scene/Scene3D').then(({ captureThumb }) => {
      saveVariant(name.trim(), captureThumb())
      setName('')
    })
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🗂 배치안 비교</h3>
        <p className="hint">
          현재 배치({placementsCount}개 제품)를 저장해 두고, 여러 안을 오가며 비교하세요. 적용은 되돌리기(Ctrl+Z)로 취소할 수 있습니다.
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
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

async function screenshot() {
  const { screenshot3d } = await import('../scene/Scene3D')
  screenshot3d()
}

const SCHEMA_PROMPT = `너는 건축 평면도 이미지 해석 전문가다. 이미지의 아파트 평면도를 분석하여 다음 JSON만 출력하라 (설명 금지, 코드펜스 금지).
규칙:
- 단위는 전부 mm. 원점은 도면 좌상단, x=우측+, y=하단+.
- 도면에 적힌 치수 숫자를 최우선 사용. 치수가 없으면 문 폭 900mm 등 일반 규격으로 비율 추정.
- walls: 각 벽을 선분 {id:"w1"...,"a":{x,y},"b":{x,y},"thickness} 로. 외벽 200, 내벽 120 권장.
- openings: 문/창문. {wallId, type:"door"|"window"|"entry", offset(벽 시작점부터 거리), width, height, sill}. door height 2000~2100 sill 0 / window sill 900~1000.
- rooms: 방 이름(한글: 안방,방1,방2,주방,거실,욕실,현관 등)과 polygon(꼭짓점 배열, 닫힌 영역).
출력 형식:
{"wallHeight":2400,"walls":[...],"openings":[...],"rooms":[{"name":"...","polygon":[{x,y},...]},...]}`

function AiModal({ onClose }: { onClose: () => void }) {
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
    const st = useStore.getState()
    if (!ai.apiKey.trim()) {
      st.showToast('API 키가 설정되지 않았습니다. ⚙️ 설정에서 입력하세요', 'error')
      setStatus('API 키 미설정 — ⚙️ 설정에서 입력하세요')
      return
    }
    // 429(업스트림 한도)는 자동 재시도 — Ox Alpha 등 공유 풀 모델에서 흔함
    const delays = [0, 6000, 18000]
    let lastStatus = 0
    setStatus('해석 중… (수십 초 소요)')
    try {
      const req = buildChatRequest(ai, dataUrl)
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (delays[attempt] > 0) {
          setStatus(`한도 초과(429) — ${delays[attempt] / 1000}초 후 재시도… (${attempt + 1}/${delays.length - 1})`)
          await new Promise((r) => setTimeout(r, delays[attempt]))
          setStatus('해석 중… (재시도)')
        }
        const res = await fetch(req.url, req.init)
        if (res.ok) {
          const j = await res.json()
          const content = parseChatResponse(j)
          setRawJson(content)
          apply(content)
          lastStatus = 0
          break
        }
        lastStatus = res.status
        if (res.status !== 429) break
      }
      if (lastStatus !== 0) {
        const map: Record<number, string> = {
          401: 'API 키가 올바르지 않습니다(401) — ⚙️ 설정에서 키를 다시 확인하세요',
          402: 'API 크레딧 부족(402) — OpenRouter에서 크레딧을 충전하거나 설정에서 다른 모델을 선택하세요',
          429: '요청 한도 초과(429) — 모델이 현재 혼잡합니다. 잠시 후 다시 시도하거나 설정에서 다른 모델을 선택하세요',
        }
        throw new Error(map[lastStatus] ?? `API ${lastStatus}`)
      }
    } catch (e) {
      const msg = (e as Error).message
      st.showToast(`AI 해석 실패: ${msg}`, 'error')
      setStatus(`실패: ${msg}`)
    }
  }

  function apply(content: string) {
    try {
      const parsed = JSON.parse(content.replace(/```json|```/g, '').trim())
      const result = normalizeAiPlan(parsed)
      if (!result.ok || !result.plan) throw new Error(result.error)
      const st = useStore.getState()
      st.loadProject({
        version: 1,
        name: 'AI 해석 도면',
        plan: result.plan,
        placements: [],
        customProducts: st.customProducts,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      useStore.getState().setMode('2d')
      setStatus('완료! 2D 편집기에서 치수를 보정하세요.')
      setTimeout(onClose, 1200)
    } catch (e) {
      setStatus(`파싱 실패: ${(e as Error).message} — 원본 JSON을 확인해 수동 보정할 수 있습니다.`)
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>✨ AI 도면 해석 (OpenAI 호환 Vision)</h3>
        <p className="hint">
          치수가 적힌 평면도 이미지를 올리면 벽·문·창문·방 구조를 JSON으로 변환합니다.
          결과는 반드시 <b>2D 편집기에서 보정</b>하세요. (아키스케치류 상용 서비스도 표준오차 50~80mm)
        </p>
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        {dataUrl && (
          <img src={dataUrl} alt="도면 미리보기" style={{ maxWidth: '100%', maxHeight: 200, marginTop: 8, border: '1px solid #333' }} />
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
  const [form, setForm] = useState(ai)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hp3d.ai')
      if (saved) setForm(JSON.parse(saved))
    } catch {
      /* 무시 */
    }
  }, [])

  function save() {
    setAi(form)
    localStorage.setItem('hp3d.ai', JSON.stringify(form))
    onClose()
  }  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ AI 설정 (OpenAI 호환)</h3>
        <div className="presets">
          <button
            onClick={() => setForm({ ...form, baseUrl: 'https://openrouter.ai/api/v1', model: 'stealth/ox-alpha' })}
            title="OpenRouter — Ox Alpha (vision)"
          >
            Ox Alpha
          </button>
          <button
            onClick={() => setForm({ ...form, baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' })}
            title="OpenRouter — openai/gpt-4o"
          >
            OpenRouter · GPT-4o
          </button>
          <button
            onClick={() => setForm({ ...form, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' })}
            title="OpenAI 공식 API"
          >
            OpenAI 직접
          </button>
        </div>
        <label>
          Base URL
          <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
        </label>
        <label>
          모델
          <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="gpt-4o" />
        </label>
        <label>
          API Key
          <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." />
        </label>
        <p className="hint">키는 브라우저(localStorage)에만 저장되며 외부로 전송되지 않습니다. LM Studio/Ollama 등 로컬 엔드포인트도 가능.</p>
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
