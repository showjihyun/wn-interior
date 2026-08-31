// ─────────────────────────────────────────────────────────────
// 배치된 가구 렌더 + 인터랙션(선택·드래그·벽자석·회전·충돌)
// 드래그 중: 히스토리 없는 move / 드래그 종료: 커밋 1회 → Undo 1번에 복원
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { FloorPlan, Placement, Product } from '../../domain/model'
import { useStore, useStoreApi } from '../AppRuntimeContext'
import { Shape } from './shapes'
import { snapPlacement as resolveSnap } from '../../domain/engine/geom'
import { resolveDims } from '../../domain/engine/dims'
import { canDropAt } from '../../domain/engine/drop'
import { getPlanCenter } from '../../domain/planBounds'
import { computePlacementConflicts } from '../../domain/placementConflicts'
import { ProductVisual } from './ProductVisual'
import { resolveSurfacePlacement } from '../../domain/surfacePlacement'
import { placementFailureMessage } from '../placementFailureMessage'

function FurnitureItem({
  placement,
  product,
  plan,
  conflicted,
}: {
  placement: Placement
  product: Product
  plan: FloorPlan
  conflicted: boolean
}) {
  const selectedId = useStore((s) => s.selectedId)
  const pendingProductId = useStore((s) => s.pendingProductId)
  const select = useStore((s) => s.select)
  const movePlacement = useStore((s) => s.movePlacement)
  const moving = useStore((s) => s.moving)
  const beginMove = useStore((s) => s.beginMove)
  const confirmMove = useStore((s) => s.confirmMove)
  const cancelMove = useStore((s) => s.cancelMove)
  // drei OrbitControls(makeDefault) — 가구 선택/드래그 중 카메라 회전 차단
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  const [hovered, setHovered] = useState(false)
  const dragging = useRef(false)
  const isMovingThis = moving?.id === placement.id
  const isMovingAny = !!moving
  const interactionLocked = !!pendingProductId

  // 이동 확정 대기 중엔 카메라 회전 잠금 (전역 이동 상태와 동기화)
  useEffect(() => {
    if (controls) controls.enabled = !moving
  }, [controls, moving])

  useEffect(() => {
    if (!interactionLocked) return
    setHovered(false)
    document.body.style.cursor = ''
  }, [interactionLocked])

  const isSel = selectedId === placement.id
  const yBase =
    product.mount === 'ceiling'
      ? plan.wallHeight
      : product.mount === 'wall-mount' || product.mount === 'surface'
        ? (placement.elevationOverride ?? product.defaultElevation ?? 0)
        : 0
  const color = placement.colorway ?? product.colorways?.[0]
  const eff = resolveDims(product, placement)
  const effProduct = { ...product, dims: eff }

  const downScreen = useRef<{ x: number; y: number } | null>(null)
  const originRef = useRef<{
    x: number
    z: number
    rotY: number
    roomId?: string
  } | null>(null)
  const beganMove = useRef(false)

  function down(e: ThreeEvent<PointerEvent>) {
    if (isMovingAny && !isMovingThis) return // 다른 가구 이동 확정 대기 중엔 무시
    e.stopPropagation()
    select(placement.id)
    dragging.current = true
    // 선택/드래그 시작 즉시 카메라 회전 차단 (요구사항: 선택·DnD 중 화면 고정)
    if (controls) controls.enabled = false
    ;(e.target as Element)?.setPointerCapture?.(e.pointerId)
    downScreen.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
    // 원위치는 이동 시작 전 위치 (재조정 시엔 기존 origin 유지)
    if (!isMovingThis)
      originRef.current = {
        x: placement.pos.x,
        z: placement.pos.z,
        rotY: placement.rotY,
        roomId: placement.roomId,
      }
    beganMove.current = isMovingThis
    document.body.style.cursor = 'grabbing'
  }

  function move(e: ThreeEvent<PointerEvent>) {
    if (!dragging.current) return
    e.stopPropagation()
    // 드래그 임계값(8px) 초과 시에만 '이동 확정 대기' 모드 진입 — 단순 클릭 선택은 제외
    if (!beganMove.current && downScreen.current) {
      const dx = e.nativeEvent.clientX - downScreen.current.x
      const dy = e.nativeEvent.clientY - downScreen.current.y
      if (Math.hypot(dx, dy) < 8) return
      if (originRef.current) {
        beginMove(placement.id, originRef.current)
        beganMove.current = true
      }
    }
    const hit = rayGround(e.ray)
    if (!hit) return
    const s = resolveSnap(plan, product, hit.x, hit.y, placement.rotY)
    movePlacement(placement.id, s.x, s.z, s.roomId)
  }

  function up(e: ThreeEvent<PointerEvent>) {
    if (!dragging.current) return
    dragging.current = false
    ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
    if (beganMove.current) {
      // 실제 이동이 있었음 → 확정 대기 유지 (우측 상단 완료 버튼 표시)
      document.body.style.cursor = 'move'
    } else {
      // 단순 클릭 선택 — 이동 없음, 카메라 복구
      if (controls) controls.enabled = true
      document.body.style.cursor = ''
    }
  }

  const r = Math.max(eff.w, eff.d) / 2 + 60

  return (
    <group
      position={[placement.pos.x, yBase, placement.pos.z]}
      rotation={[0, (placement.rotY * Math.PI) / 180, 0]}
      onPointerDown={interactionLocked ? undefined : down}
      onPointerMove={interactionLocked ? undefined : move}
      onPointerUp={interactionLocked ? undefined : up}
      onPointerOver={
        interactionLocked
          ? undefined
          : (e) => {
              e.stopPropagation()
              setHovered(true)
              if (!dragging.current) document.body.style.cursor = 'grab'
            }
      }
      onPointerOut={
        interactionLocked
          ? undefined
          : () => {
              setHovered(false)
              if (!dragging.current) document.body.style.cursor = ''
            }
      }
    >
      <ProductVisual product={effProduct} color={color} />
      {isSel && (
        <SelectionOutline w={eff.w} h={eff.h} d={eff.d} hangsDown={product.mount === 'ceiling'} />
      )}
      {(isSel || hovered) && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, product.mount === 'ceiling' ? 40 : 6, 0]}
        >
          <ringGeometry args={[r, r + 50, 48]} />
          <meshBasicMaterial
            color={isSel ? '#ffd54a' : '#9ecbff'}
            transparent
            opacity={0.95}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {conflicted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 4, 0]}>
          <planeGeometry args={[eff.w, eff.d]} />
          <meshBasicMaterial color="#ff4d4d" transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* 이동 확정 대기 — 객체 우측 상단에 완료 버튼 */}
      {isMovingThis && (
        <Html
          position={[product.dims.w / 2 + 120, product.dims.h + 160, 0]}
          center
          zIndexRange={[16777271, 100]}
        >
          <div
            className="drop-confirm"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              confirmMove()
            }}
          >
            <button className="dc-ok" title="현재 위치에 배치 (Enter)">
              ✓ 이동 완료
            </button>
            <button
              className="dc-cancel"
              title="원위치 (Esc)"
              onClick={(e) => {
                e.stopPropagation()
                cancelMove()
              }}
            >
              ✕
            </button>
          </div>
        </Html>
      )}
    </group>
  )
}

/** 선택 테두리 — 실측 박스에 딱 맞는 노란 엣지 아웃라인 (펄스 + 벽 뒤에서도 보임) */
function SelectionOutline({
  w,
  h,
  d,
  hangsDown,
}: {
  w: number
  h: number
  d: number
  hangsDown: boolean
}) {
  const matRef = useRef<THREE.LineBasicMaterial>(null)
  const geo = useMemo(() => {
    const M = 40 // 여유 마진(박스 지오메트리 z-fighting 방지)
    return new THREE.EdgesGeometry(new THREE.BoxGeometry(w + M, h + M, d + M))
  }, [w, h, d])
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.opacity = 0.6 + 0.4 * Math.sin(clock.elapsedTime * 5)
  })
  return (
    <lineSegments geometry={geo} position={[0, hangsDown ? -h / 2 : h / 2, 0]} renderOrder={999}>
      <lineBasicMaterial ref={matRef} color="#ffd54a" transparent depthTest={false} />
    </lineSegments>
  )
}

function rayGround(ray: THREE.Ray): THREE.Vector2 | null {
  const t = -ray.origin.y / ray.direction.y
  if (!isFinite(t) || t < 0) return null
  const p = ray.origin.clone().addScaledVector(ray.direction, t)
  return new THREE.Vector2(p.x, p.z)
}

/** 신규 배치 고스트(유령 미리보기) + 클릭 확정 */
function Ghost({ plan }: { plan: FloorPlan }) {
  const store = useStoreApi()
  const pendingId = useStore((s) => s.pendingProductId)
  const setPending = useStore((s) => s.setPending)
  const addPlacement = useStore((s) => s.addPlacement)
  const product = useStore((s) => (pendingId ? s.productById(pendingId) : undefined))
  const [ghost, setGhost] = useState<{
    x: number
    z: number
    rotY: number
    elevation: number
    ok: boolean
  } | null>(null)

  if (!pendingId || !product) return null

  function track(e: ThreeEvent<PointerEvent>) {
    const hit = rayGround(e.ray)
    if (!hit || !product) return
    const s = resolveSnap(plan, product, hit.x, hit.y, ghost?.rotY ?? 0)
    const surface = resolveSurfacePlacement(
      product,
      store.getState().placements,
      s.x,
      s.z,
      store.getState().productById
    )
    const candidate = surface ?? { x: s.x, z: s.z, rotY: s.rotY, elevation: 0 }
    const validation = canDropAt(
      plan,
      product,
      store.getState().placements,
      null,
      candidate.x,
      candidate.z,
      candidate.rotY,
      (pid) => store.getState().productById(pid)
    )
    setGhost({ ...candidate, ok: validation.ok })
  }

  function confirm(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    const hit = rayGround(e.ray)
    if (!hit || !pendingId || !product) return
    const candidate = resolveSnap(plan, product, hit.x, hit.y, ghost?.rotY ?? 0)
    const r = canDropAt(
      plan,
      product,
      store.getState().placements,
      null,
      candidate.x,
      candidate.z,
      candidate.rotY,
      (pid) => store.getState().productById(pid)
    )
    if (!r.ok) {
      store.getState().showToast(placementFailureMessage(product, r))
      return
    }
    const placementId = addPlacement(pendingId, { x: candidate.x, z: candidate.z }, candidate.rotY)
    if (!placementId) return
    setPending(null)
    setGhost(null)
  }

  return (
    <>
      {/* 바닥 평면 이벤트 수집 (투명하지만 레이캐스트 가능해야 함) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[planCenter(plan).x, 0.5, planCenter(plan).y]}
        onPointerMove={track}
        onClick={confirm}
      >
        <planeGeometry args={[100000, 100000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {ghost && (
        <group
          position={[
            ghost.x,
            product.mount === 'ceiling' ? plan.wallHeight : ghost.elevation,
            ghost.z,
          ]}
          rotation={[0, (ghost.rotY * Math.PI) / 180, 0]}
          onPointerMove={track}
          onClick={confirm}
        >
          <group scale={[1, 1, 1]}>
            <Shape kind={product.shape} p={product} c={product.colorways?.[0]} />
          </group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 8, 0]}>
            <planeGeometry args={[product.dims.w + 80, product.dims.d + 80]} />
            <meshBasicMaterial
              color={ghost.ok ? '#59d499' : '#ff6b6b'}
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
    </>
  )
}

export function planCenter(plan: FloorPlan): { x: number; y: number } {
  return getPlanCenter(plan)
}

export function FurnitureAll({ plan }: { plan: FloorPlan }) {
  const placements = useStore((s) => s.placements)
  const productOf = useStore((s) => s.productById)
  const conflicts = useMemo(
    () => computePlacementConflicts(placements, productOf),
    [placements, productOf]
  )

  return (
    <group>
      {placements.map((pl) => {
        const prod = productOf(pl.productId)
        if (!prod) return null
        return (
          <FurnitureItem
            key={pl.id}
            placement={pl}
            product={prod}
            plan={plan}
            conflicted={conflicts.has(pl.id)}
          />
        )
      })}
      <Ghost plan={plan} />
    </group>
  )
}
