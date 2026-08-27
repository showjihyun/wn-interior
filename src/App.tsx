import { useEffect } from 'react'
import { useStore } from './store/store'
import { Toolbar } from './ui/Toolbar'
import { LeftPanel } from './ui/LeftPanel'
import { InspectorPanel } from './ui/InspectorPanel'
import { Scene3D } from './scene/Scene3D'
import { Editor2D } from './editor2d/Editor2D'
import { WalkPanel } from './ui/WalkPanel'

export function App() {
  const mode = useStore((s) => s.mode)
  const toast = useStore((s) => s.toast)
  const viewPreset = useStore((s) => s.viewPreset)

  useEffect(() => {
    function key(e: KeyboardEvent) {
      const st = useStore.getState()
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        const st = useStore.getState()
        // 취소 우선순위: 이동 확정 대기(원위치) → 선택 해제 → 신규 배치 취소
        if (st.moving) st.cancelMove()
        else if (st.selectedId) st.select(null)
        st.setPending(null)
      }
      if ((e.key === 'r' || e.key === 'R') && st.selectedId) {
        const pl = st.placements.find((p) => p.id === st.selectedId)
        if (pl) st.updatePlacement(pl.id, { rotY: pl.rotY + (e.shiftKey ? -15 : 15) })
        e.preventDefault()
      }
      if (e.key === '1') useStore.getState().setMode('2d') // 오늘의집 벤치마크: 1=2D
      if (e.key === '3') useStore.getState().setMode('3d') // 3=3D
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        st.selectedId &&
        !st.selectedId.startsWith('wall:')
      ) {
        st.removePlacement(st.selectedId)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <LeftPanel />
        <div className="viewport">
          {mode === '3d' ? <Scene3D /> : <Editor2D />}
          {mode === '3d' && viewPreset === 'walk' && <WalkPanel />}
        </div>
        <InspectorPanel />
      </div>
      <div className="statusbar">
        단위 mm · 자동저장됨 · 좌클릭 배치/선택 · 드래그 이동 → ✓ 이동완료로 확정 · R 회전 · Delete
        삭제 · Ctrl+Z 되돌리기
      </div>
      {toast && (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          {toast.kind === 'error' ? '⛔' : toast.kind === 'info' ? 'ℹ️' : '⚠️'} {toast.msg}
        </div>
      )}
    </div>
  )
}
