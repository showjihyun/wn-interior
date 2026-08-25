import { useEffect } from 'react'
import { useStore } from './store/store'
import { Toolbar } from './ui/Toolbar'
import { LeftPanel } from './ui/LeftPanel'
import { InspectorPanel } from './ui/InspectorPanel'
import { Scene3D } from './scene/Scene3D'
import { Editor2D } from './editor2d/Editor2D'

export function App() {
  const mode = useStore((s) => s.mode)
  const toast = useStore((s) => s.toast)

  useEffect(() => {
    function key(e: KeyboardEvent) {
      const st = useStore.getState()
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        const st = useStore.getState()
        if (st.moving) st.cancelMove()
        st.setPending(null)
      }
      if ((e.key === 'r' || e.key === 'R') && st.selectedId) {
        const pl = st.placements.find((p) => p.id === st.selectedId)
        if (pl) st.updatePlacement(pl.id, { rotY: pl.rotY + (e.shiftKey ? -15 : 15) })
        e.preventDefault()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId && !st.selectedId.startsWith('wall:')) {
        st.removePlacement(st.selectedId)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? st.redo() : st.undo()
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
        <div className="viewport">{mode === '3d' ? <Scene3D /> : <Editor2D />}</div>
        <InspectorPanel />
      </div>
      <div className="statusbar">
        단위 mm · 자동저장됨 · 좌클릭 배치/선택 · 드래그 이동 → ✓ 이동완료로 확정 · R 회전 · Delete 삭제 · Ctrl+Z 되돌리기
      </div>
      {toast && (
        <div key={toast.id} className="toast">
          ⚠️ {toast.msg}
        </div>
      )}
    </div>
  )
}
