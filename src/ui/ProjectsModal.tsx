// ─────────────────────────────────────────────────────────────
// 프로젝트 관리 — 세션(브라우저)별 다중 프로젝트 목록/생성/열기/삭제
// 나중: StorageAdapter를 DB 어댑터로 교체하면 계정별 CRUD로 확장
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { storage, type ProjectMeta } from '../storage/storage'

export function ProjectsModal({ onClose }: { onClose: () => void }) {
  const currentId = useStore((s) => s.projectId)
  const newProject = useStore((s) => s.newProject)
  const openProject = useStore((s) => s.openProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const refreshProjects = useStore((s) => s.refreshProjects)
  const [list, setList] = useState<ProjectMeta[]>([])
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])
  useEffect(() => {
    setList(storage.list())
  }, [currentId, refreshProjects])

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
          브라우저(세션)별로 저장됩니다. 나중에 계정 DB와 동기화될 예정입니다.
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
                  <button onClick={() => { openProject(m.id); onClose() }}>열기</button>
                )}
                {confirmDel === m.id ? (
                  <>
                    <button className="danger" onClick={() => { deleteProject(m.id); setConfirmDel(null) }}>확인</button>
                    <button onClick={() => setConfirmDel(null)}>아니오</button>
                  </>
                ) : (
                  <button className="danger" onClick={() => setConfirmDel(m.id)}>삭제</button>
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
