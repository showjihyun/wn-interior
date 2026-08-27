// ─────────────────────────────────────────────────────────────
// 배치된 가구 렌더 + 인터랙션(선택·드래그·벽자석·회전·충돌)
// 드래그 중: 히스토리 없는 move / 드래그 종료: 커밋 1회 → Undo 1번에 복원
// ─────────────────────────────────────────────────────────────
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Html } from '@react-three/drei'
import type { FloorPlan, Placement, Product } from '../types'
import { useStore } from '../store/store'
import { Shape } from './shapes'
import { footprintAABB, aabbOverlap, roomAt, snapPlacement as resolveSnap } from '../engine/geom'
import { resolveDims } from '../engine/dims'
import { canDropAt } from '../engine/drop'

/** GLTF 모델을 실측 높이에 자동 피팅 (바닥 중심 정렬) */
function GltfProduct({ url, dims }: { url: string; dims: Product['dims'] }) {
  const { scene } = useGLTF(url)
  const prepared = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    const box = new THREE.Box3().setFromObject(c)
    const size = box.getSize(new THREE.Vector3())
    const s = dims.h / Math.max(size.y, 1e-6)
    c.scale.setScalar(s)
    const nb = new THREE.Box3().setFromObject(c)
    const ctr = nb.getCenter(new THREE.Vector3())
    c.position.set(-ctr.x, -nb.min.y, -ctr.z)
    return c
  }, [scene, dims.h])
  return <primitive object={prepared} />
}

export function computeConflicts(
  placements: Placement[],
  productOf: (id: string) => Product | undefined
): Set<string> {
  const items = placements
    .map((pl) => {
      const prod = productOf(pl.productId)
      if (!prod || prod.mount === 'wall-mount' || prod.mount === 'ceiling') return null
      const eff = resolveDims(prod, pl)
      return {
        id: pl.id,
        box: footprintAABB(eff.w, eff.d, pl.pos.x, pl.pos.z, pl.rotY),
      }
    })
    .filter(Boolean) as { id: string; box: ReturnType<typeof footprintAABB> }[]
  const bad = new Set<string>()
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (aabbOverlap(items[i].box, items[j].box)) {
        bad.add(items[i].id)
        bad.add(items[j].id)
      }
  return bad
}

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

  // 이동 확정 대기 중엔 카메라 회전 잠금 (전역 이동 상태와 동기화)
  useEffect(() => {
    if (controls) controls.enabled = !moving
  }, [controls, moving])

  const isSel = selectedId === placement.id
  const yBase =
    product.mount === 'ceiling'
      ? plan.wallHeight
      : product.mount === 'wall-mount'
        ? (placement.elevationOverride ?? product.defaultElevation ?? 0)
        : 0
  const color = placement.colorway ?? product.colorways?.[0]
  const eff = resolveDims(product, placement)
  const effProduct = { ...product, dims: eff }

  const downScreen = useRef<{ x: number; y: number } | null>(null)
  const originRef = useRef<{ x: number; z: number; rotY: number } | null>(null)
  const beganMove = useRef(false)

  function down(e: ThreeEvent<PointerEvent>) {
    if (useStore.getState().pendingProductId) return
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
      originRef.current = { x: placement.pos.x, z: placement.pos.z, rotY: placement.rotY }
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
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        if (!dragging.current) document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        setHovered(false)
        if (!dragging.current) document.body.style.cursor = ''
      }}
    >
      <Suspense fallback={<FallbackBox dims={product.dims} color={color} />}>
        {product.modelUrl ? (
          <GltfProduct url={product.modelUrl} dims={product.dims} />
        ) : (
          <Shape kind={product.shape} p={effProduct} c={color} />
        )}
      </Suspense>
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

function FallbackBox({ dims, color }: { dims: Product['dims']; color?: string }) {
  return (
    <mesh castShadow receiveShadow position={[0, dims.h / 2, 0]}>
      <boxGeometry args={[dims.w, dims.h, dims.d]} />
      <meshStandardMaterial color={color ?? '#bbb'} roughness={0.8} />
    </mesh>
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
  const pendingId = useStore((s) => s.pendingProductId)
  const setPending = useStore((s) => s.setPending)
  const addPlacement = useStore((s) => s.addPlacement)
  const product = useStore((s) => (pendingId ? s.productById(pendingId) : undefined))
  const [ghost, setGhost] = useState<{ x: number; z: number; rotY: number; ok: boolean } | null>(
    null
  )

  if (!pendingId || !product) return null

  function track(e: ThreeEvent<PointerEvent>) {
    const hit = rayGround(e.ray)
    if (!hit || !product) return
    const s = resolveSnap(plan, product, hit.x, hit.y, ghost?.rotY ?? 0)
    setGhost({ x: s.x, z: s.z, rotY: s.rotY, ok: !!roomAt(plan, s.x, s.z) })
  }

  function confirm(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    const hit = rayGround(e.ray)
    if (!hit || !pendingId || !product) return
    const candidate = resolveSnap(plan, product, hit.x, hit.y, ghost?.rotY ?? 0)
    const r = canDropAt(
      plan,
      product,
      useStore.getState().placements,
      null,
      candidate.x,
      candidate.z,
      candidate.rotY,
      (pid) => useStore.getState().productById(pid)
    )
    if (!r.ok) {
      useStore
        .getState()
        .showToast(
          r.reason === 'out-of-room'
            ? '방 안에만 배치할 수 있어요'
            : '공간이 부족해 배치할 수 없어요'
        )
      return
    }
    addPlacement(pendingId, { x: candidate.x, z: candidate.z }, candidate.rotY)
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
          position={[ghost.x, product.mount === 'ceiling' ? plan.wallHeight : 0, ghost.z]}
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
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const r of plan.rooms)
    for (const pt of r.polygon) {
      minX = Math.min(minX, pt.x)
      maxX = Math.max(maxX, pt.x)
      minY = Math.min(minY, pt.y)
      maxY = Math.max(maxY, pt.y)
    }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

export function FurnitureAll({ plan }: { plan: FloorPlan }) {
  const placements = useStore((s) => s.placements)
  const productOf = useStore((s) => s.productById)
  const conflicts = useMemo(() => computeConflicts(placements, productOf), [placements, productOf])

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
