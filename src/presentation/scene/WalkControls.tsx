// ─────────────────────────────────────────────────────────────
// 워크스루 캐릭터 — 1인칭(눈높이)/3인칭(후방 추적) + 신장·몸무게 반영
// 충돌: 벽(선분+두께) + 배치 가구 AABB (유효 치수) + 도면 경계
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { useStore } from '../AppRuntimeContext'
import {
  resolveWalkMove,
  resolveWalkVertical,
  type Obstacle,
  type WalkBounds,
  type WalkVerticalState,
} from '../../domain/engine/walk'
import { resolveDims } from '../../domain/engine/dims'
import { footprintAABB } from '../../domain/engine/geom'
import type { FloorPlan } from '../../domain/model'
import { getPlanBounds } from '../../domain/planBounds'
import { characterRadius, WALK_EYE_RATIO, WALK_RUN, WALK_SPEED } from '../../domain/walkProfile'

function planBounds(plan: FloorPlan): WalkBounds {
  const bounds = getPlanBounds(plan)
  return bounds
    ? { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minY, maxZ: bounds.maxY }
    : { minX: 0, maxX: 10000, minZ: 0, maxZ: 8000 }
}

export function WalkControls({ plan }: { plan: FloorPlan }) {
  const { camera, gl } = useThree()
  const walkConfig = useStore((s) => s.walkConfig)
  const walkView = useStore((s) => s.walkView)
  const placements = useStore((s) => s.placements)
  const productOf = useStore((s) => s.productById)

  const keys = useRef<Record<string, boolean>>({})
  const yaw = useRef(0)
  const pitch = useRef(-0.05)
  const pos = useRef<{ x: number; z: number }>({ x: 0, z: 0 })
  const vertical = useRef<WalkVerticalState>({ y: 0, velocityY: 0, grounded: true })
  const jumpWasDown = useRef(false)
  const initialized = useRef(false)

  // 가구 장애물 (floor 제품, 유효 치수)
  const obstacles = useMemo<Obstacle[]>(() => {
    const out: Obstacle[] = []
    for (const pl of placements) {
      const prod = productOf(pl.productId)
      if (!prod || prod.mount === 'wall-mount' || prod.mount === 'ceiling') continue
      const eff = resolveDims(prod, pl)
      if (eff.h <= 50) continue // 러그 등 통과 가능
      out.push({
        ...footprintAABB(eff.w, eff.d, pl.pos.x, pl.pos.z, pl.rotY),
        topY: (pl.elevationOverride ?? pl.pos.y ?? 0) + eff.h,
      })
    }
    return out
  }, [placements, productOf])

  const wallsRef = useRef(plan.walls)
  wallsRef.current = plan.walls
  const obstaclesRef = useRef(obstacles)
  obstaclesRef.current = obstacles
  const boundsRef = useRef<WalkBounds>(planBounds(plan))
  boundsRef.current = planBounds(plan)

  // 초기 스폰: 도면 중심 남쪽, 북쪽 바라봄
  useEffect(() => {
    camera.rotation.order = 'YXZ'
    let cx = 5000
    let cz = 4000
    let span = 8000
    const b = boundsRef.current
    if (isFinite(b.minX)) {
      cx = (b.minX + b.maxX) / 2
      cz = (b.minZ + b.maxZ) / 2
      span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ)
    }
    pos.current = { x: cx, z: cz + Math.min(3200, span * 0.3) }
    yaw.current = 0
    pitch.current = -0.05
    vertical.current = { y: 0, velocityY: 0, grounded: true }
    jumpWasDown.current = false
    initialized.current = true

    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault()
      keys.current[e.code] = true
    }
    const ku = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }
    const el = gl.domElement
    let dragging = false
    let lx = 0
    let ly = 0
    const pd = (e: PointerEvent) => {
      dragging = true
      lx = e.clientX
      ly = e.clientY
    }
    const pm = (e: PointerEvent) => {
      if (!dragging) return
      yaw.current -= ((e.clientX - lx) * Math.PI) / 380
      pitch.current -= ((e.clientY - ly) * Math.PI) / 380
      pitch.current = Math.max(-1.05, Math.min(1.05, pitch.current))
      lx = e.clientX
      ly = e.clientY
    }
    const pu = () => {
      dragging = false
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    el.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      el.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      keys.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl])

  const cfgRef = useRef(walkConfig)
  cfgRef.current = walkConfig
  const viewRef = useRef(walkView)
  viewRef.current = walkView

  useFrame((_, dtRaw) => {
    if (!initialized.current) return
    const k = keys.current
    const speed = (k.ShiftLeft || k.ShiftRight ? WALK_RUN : WALK_SPEED) * Math.min(dtRaw, 0.05)
    const f = { x: -Math.sin(yaw.current), z: -Math.cos(yaw.current) }
    const r = { x: Math.cos(yaw.current), z: -Math.sin(yaw.current) }
    let dx = 0
    let dz = 0
    if (k.KeyW || k.ArrowUp) {
      dx += f.x
      dz += f.z
    }
    if (k.KeyS || k.ArrowDown) {
      dx -= f.x
      dz -= f.z
    }
    if (k.KeyD || k.ArrowRight) {
      dx += r.x
      dz += r.z
    }
    if (k.KeyA || k.ArrowLeft) {
      dx -= r.x
      dz -= r.z
    }
    const radius = characterRadius(cfgRef.current.weightKg)
    const jumpRequested = !!k.Space && !jumpWasDown.current
    jumpWasDown.current = !!k.Space
    const verticalBefore = vertical.current
    let verticalNext = resolveWalkVertical(
      verticalBefore,
      obstaclesRef.current,
      pos.current.x,
      pos.current.z,
      Math.min(dtRaw, 0.05),
      jumpRequested
    )
    if (dx !== 0 || dz !== 0) {
      const moved = resolveWalkMove(
        wallsRef.current,
        obstaclesRef.current,
        pos.current,
        dx * speed,
        dz * speed,
        radius,
        boundsRef.current,
        verticalNext.y
      )
      pos.current = moved
      verticalNext = resolveWalkVertical(
        verticalBefore,
        obstaclesRef.current,
        moved.x,
        moved.z,
        Math.min(dtRaw, 0.05),
        jumpRequested
      )
    }
    vertical.current = verticalNext
    const eyeH = cfgRef.current.heightCm * 10 * WALK_EYE_RATIO
    if (viewRef.current === 'fp') {
      camera.position.set(pos.current.x, eyeH + vertical.current.y, pos.current.z)
      camera.rotation.set(pitch.current, yaw.current, 0)
    } else {
      const dist = 2400
      const camH = eyeH + 900 + vertical.current.y
      const fx = Math.sin(yaw.current)
      const fz = Math.cos(yaw.current)
      camera.position.set(pos.current.x - fx * dist, camH, pos.current.z - fz * dist)
      camera.rotation.set(pitch.current - 0.22, yaw.current, 0)
    }
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      ;(window as unknown as Record<string, unknown>).__hp3d_walk = {
        x: pos.current.x,
        z: pos.current.z,
        yaw: yaw.current,
        radius,
        eyeH,
        y: vertical.current.y,
        velocityY: vertical.current.velocityY,
        grounded: vertical.current.grounded,
      }
    }
  })

  return (
    <CharacterAvatar
      pos={pos}
      vertical={vertical}
      yaw={yaw}
      visible={walkView === 'tp'}
      heightMm={walkConfig.heightCm * 10}
      radiusMm={characterRadius(walkConfig.weightKg)}
    />
  )
}

function CharacterAvatar({
  pos,
  vertical,
  yaw,
  visible,
  heightMm,
  radiusMm,
}: {
  pos: React.RefObject<{ x: number; z: number }>
  vertical: React.RefObject<WalkVerticalState>
  yaw: React.RefObject<number>
  visible: boolean
  heightMm: number
  radiusMm: number
}) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!g.current) return
    g.current.position.set(pos.current?.x ?? 0, vertical.current?.y ?? 0, pos.current?.z ?? 0)
    g.current.rotation.y = yaw.current ?? 0
  })
  const bodyR = Math.max(90, radiusMm * 0.55)
  return (
    <group ref={g} visible={visible}>
      {/* 몸통+다리 캡슐 */}
      <mesh castShadow position={[0, heightMm * 0.42, 0]}>
        <capsuleGeometry args={[bodyR, heightMm * 0.52, 8, 20]} />
        <meshStandardMaterial color="#4a5568" roughness={0.75} />
      </mesh>
      {/* 머리 */}
      <mesh castShadow position={[0, heightMm * 0.87, 0]}>
        <sphereGeometry args={[heightMm * 0.062, 24, 18]} />
        <meshStandardMaterial color="#d9b38c" roughness={0.6} />
      </mesh>
    </group>
  )
}
