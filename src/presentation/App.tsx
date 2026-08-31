import { lazy, Suspense, useEffect } from 'react'
import { useStore, useStoreApi } from './AppRuntimeContext'
import { Toolbar } from './ui/Toolbar'
import { LeftPanel } from './ui/LeftPanel'
import { InspectorPanel } from './ui/InspectorPanel'
import { Editor2D } from './editor2d/Editor2D'
import { WalkPanel } from './ui/WalkPanel'
import { SceneControls } from './ui/SceneControls'

const Scene3D = lazy(() =>
  import('./scene/Scene3D').then((module) => ({ default: module.Scene3D }))
)

export function App() {
  const store = useStoreApi()
  const mode = useStore((s) => s.mode)
  const toast = useStore((s) => s.toast)
  const viewPreset = useStore((s) => s.viewPreset)
  const pendingProduct = useStore((s) =>
    s.pendingProductId ? s.productById(s.pendingProductId) : undefined
  )

  useEffect(() => {
    function key(e: KeyboardEvent) {
      const st = store.getState()
      if (e.key === 'Escape') {
        e.preventDefault()
        // 취소 우선순위: 이동 확정 대기(원위치) → 선택 해제 → 신규 배치 취소
        if (st.moving) st.cancelMove()
        else if (st.selectedId) st.select(null)
        st.setPending(null)
        return
      }
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.key === 'r' || e.key === 'R') && st.selectedId) {
        const pl = st.placements.find((p) => p.id === st.selectedId)
        if (pl) st.updatePlacement(pl.id, { rotY: pl.rotY + (e.shiftKey ? -15 : 15) })
        e.preventDefault()
      }
      if (e.key === '1') store.getState().setMode('2d')
      if (e.key === '3') store.getState().setMode('3d')
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
  }, [store])

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <LeftPanel />
        <div className="viewport">
          {mode === '3d' ? (
            <Suspense fallback={<div className="scene-loading">3D 엔진을 불러오는 중…</div>}>
              <Scene3D />
            </Suspense>
          ) : (
            <Editor2D />
          )}
          {mode === '3d' && viewPreset === 'walk' && <WalkPanel />}
          {mode === '3d' && viewPreset !== 'walk' && <SceneControls />}
        </div>
        <InspectorPanel />
      </div>
      <div
        className={`statusbar${pendingProduct ? ' placing' : ''}`}
        role="status"
        aria-live="polite"
      >
        {pendingProduct ? (
          <>◎ {pendingProduct.name} 배치 중 · 원하는 위치를 클릭하세요 · Esc 취소</>
        ) : (
          <>
            단위 mm · 자동저장됨 · 좌클릭 배치/선택 · 드래그 이동 → ✓ 이동완료로 확정 · R 회전 ·
            Delete 삭제 · Ctrl+Z 되돌리기
          </>
        )}
      </div>
      {toast && (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          {toast.kind === 'error' ? '⛔' : toast.kind === 'info' ? 'ℹ️' : '⚠️'} {toast.msg}
        </div>
      )}
    </div>
  )
}
