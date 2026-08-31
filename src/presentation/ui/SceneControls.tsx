import { useAppRuntime, useStore } from '../AppRuntimeContext'

export function SceneControls() {
  const { sceneSurface } = useAppRuntime()
  const placement = useStore((state) =>
    state.placements.find((candidate) => candidate.id === state.selectedId)
  )
  const updatePlacement = useStore((state) => state.updatePlacement)

  return (
    <div className="scene-controls" aria-label="3D 화면 조작">
      <button
        type="button"
        aria-label="선택 제품 15도 회전"
        disabled={!placement}
        onClick={() => {
          if (placement) updatePlacement(placement.id, { rotY: placement.rotY + 15 })
        }}
      >
        ↻ 회전
      </button>
      <button type="button" aria-label="화면 확대" onClick={() => sceneSurface.zoomIn()}>
        + 확대
      </button>
      <button type="button" aria-label="화면 축소" onClick={() => sceneSurface.zoomOut()}>
        − 축소
      </button>
    </div>
  )
}
