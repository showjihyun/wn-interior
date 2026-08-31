// ─────────────────────────────────────────────────────────────
// 프로젝트 관리 — 세션 URL별 IndexedDB 다중 프로젝트 목록/생성/열기/삭제
// 계정 저장은 ProjectRepository를 원격 DB 어댑터로 교체해 확장
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useAppRuntime, useStore } from '../AppRuntimeContext'

export function ProjectsModal({ onClose }: { onClose: () => void }) {
  const { projectStorage } = useAppRuntime()
  const currentId = useStore((s) => s.projectId)
  const newProject = useStore((s) => s.newProject)
  const openProject = useStore((s) => s.openProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const refreshProjects = useStore((s) => s.refreshProjects)
  const list = useStore((s) => s.projects)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])
  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
    } catch {
      return iso
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>📁 내 프로젝트</h3>
        <p className="hint">
          {projectStorage.kind === 'indexeddb' ? (
            <>
              현재 세션 URL별 브라우저 DB(IndexedDB)에 자동 저장됩니다. 탭을 닫아도 이 브라우저에서
              같은 URL로 다시 접속하면 복구됩니다. 계정·다른 기기와는 동기화되지 않습니다.
            </>
          ) : (
            <>
              브라우저 DB를 사용할 수 없어 현재 탭에만 저장됩니다. 장기 보관은 상단 내보내기를
              사용하세요.
            </>
          )}
        </p>
        <button
          className="primary"
          style={{ margin: '10px 0' }}
          onClick={() => {
            newProject()
            onClose()
          }}
        >
          ＋ 새 프로젝트 (빈 도면)
        </button>
        {list.length === 0 && <p className="hint">저장된 프로젝트가 없습니다.</p>}
        <div className="proj-list">
          {list.map((m) => (
            <div key={m.id} className={`proj-item${m.id === currentId ? ' on' : ''}`}>
              <div className="pi-info">
                <b>{m.name}</b>
                <span>{fmtDate(m.updatedAt)}</span>
              </div>
              <div className="pi-actions">
                {m.id === currentId ? (
                  <span className="pi-current">현재</span>
                ) : (
                  <button
                    onClick={() => {
                      openProject(m.id)
                      onClose()
                    }}
                  >
                    열기
                  </button>
                )}
                {confirmDel === m.id ? (
                  <>
                    <button
                      className="danger"
                      onClick={() => {
                        deleteProject(m.id)
                        setConfirmDel(null)
                      }}
                    >
                      확인
                    </button>
                    <button onClick={() => setConfirmDel(null)}>아니오</button>
                  </>
                ) : (
                  <button className="danger" onClick={() => setConfirmDel(m.id)}>
                    삭제
                  </button>
                )}
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
