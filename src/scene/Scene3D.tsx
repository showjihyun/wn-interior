// ─────────────────────────────────────────────────────────────
// 3D 씬 컨테이너 — 조명/카메라 프리셋(아이소·탑·워크스루)/그리드/캡처
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { FloorPlan } from '../types'
import { useStore } from '../store/store'
import { Floors3D, Walls3D } from './Structure'
import { FurnitureAll, planCenter } from './Furniture3D'
import { projectOnSegment } from '../engine/geom'

function CameraRig({ center }: { center: { x: number; y: number } }) {
  const preset = useStore((s) => s.viewPreset)
  const { camera } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)

  useEffect(() => {
    if (preset === 'walk') return
    const c = controls.current
    if (!c) return
    if (preset === 'top') {
      camera.position.set(center.x, 16000, center.y + 1)
      c.target.set(center.x, 0, center.y)
    } else {
      camera.position.set(center.x - 9000, 9500, center.y + 11000)
      c.target.set(center.x, 400, center.y)
    }
    c.update()
  }, [preset, center.x, center.y, camera])

  if (preset === 'walk') return <WalkControls />
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      maxPolarAngle={Math.PI / 2.02}
      minDistance={1200}
      maxDistance={45000}
    />
  )
}

const EYE = 1600

/** 1인칭 워크스루: 드래그=시선, WASD/화살표=이동, 벽 충돌 차단 */
function WalkControls() {
  const plan = useStore((s) => s.plan)
  const { camera, gl } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const yaw = useRef(0)
  const pitch = useRef(0)

  // 초기 위치: 도면 중심 남쪽에서 북쪽 바라봄
  const centerRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    camera.rotation.order = 'YXZ'
    const c = planCenter(plan)
    centerRef.current = c
    camera.position.set(c.x, EYE, c.y + Math.min(3500, (maxExtent(plan) / 2) * 0.7))
    yaw.current = 0
    pitch.current = 0

    const kd = (e: KeyboardEvent) => {
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

  useFrame((_, dtRaw) => {
    const k = keys.current
    const speed = (k.ShiftLeft || k.ShiftRight ? 6000 : 2600) * Math.min(dtRaw, 0.05)
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
    if (dx !== 0) {
      const nx = camera.position.x + dx * speed
      if (!hitWall(plan, nx, camera.position.z)) camera.position.x = nx
    }
    if (dz !== 0) {
      const nz = camera.position.z + dz * speed
      if (!hitWall(plan, camera.position.x, nz)) camera.position.z = nz
    }
    camera.rotation.set(pitch.current, yaw.current, 0)
  })

  return null
}

function maxExtent(plan: FloorPlan): number {
  let m = 0
  for (const room of plan.rooms)
    for (const p of room.polygon) m = Math.max(m, Math.abs(p.x), Math.abs(p.y))
  return m * 2 || 10000
}

function hitWall(plan: FloorPlan, x: number, z: number): boolean {
  const RADIUS = 260
  for (const w of plan.walls) {
    const { dist } = projectOnSegment({ x, y: z }, w.a, w.b)
    if (dist < w.thickness / 2 + RADIUS) return true
  }
  // 도면 전체 범위 클램프 (여유 ±2m)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const room of plan.rooms)
    for (const p of room.polygon) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  return x < minX - 2000 || x > maxX + 2000 || z < minY - 2000 || z > maxY + 2000
}

function Sun({ center, intensity }: { center: { x: number; y: number }; intensity: number }) {
  return (
    <>
      <directionalLight
        castShadow
        position={[center.x - 7000, 14000, center.y - 5000]}
        intensity={1.5 * intensity}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-15000}
        shadow-camera-right={15000}
        shadow-camera-top={15000}
        shadow-camera-bottom={-15000}
        shadow-camera-far={45000}
        shadow-bias={-0.0004}
      />
      <ambientLight intensity={0.28 * intensity} />
      <hemisphereLight args={['#ffffff', '#aeb4ba', 0.65 * intensity]} />
    </>
  )
}

function GlRegistrar() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__hp3d_gl = gl
    ;(window as unknown as Record<string, unknown>).__hp3d_cam = camera
  }, [gl, camera])
  return null
}

export function Scene3D() {
  const plan = useStore((s) => s.plan)
  const pendingId = useStore((s) => s.pendingProductId)
  const select = useStore((s) => s.select)
  const setPending = useStore((s) => s.setPending)
  const lightIntensity = useStore((s) => s.lightIntensity)
  const center = planCenter(plan)

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ fov: 50, near: 50, far: 300000, position: [center.x - 9000, 9500, center.y + 11000] }}
      onPointerMissed={() => {
        const st = useStore.getState()
        if (st.moving) {
          st.cancelMove() // 이동 확정 대기 중 바깥 클릭 = 원위치 취소
          return
        }
        if (pendingId) setPending(null)
        else select(null)
      }}
      style={{ cursor: pendingId ? 'crosshair' : 'default' }}
    >
      <color attach="background" args={['#dfe6ec']} />
      <fog attach="fog" args={['#dfe6ec', 40000, 90000]} />
      <hemisphereLight args={['#ffffff', '#aeb4ba', 0.65]} />
      <ambientLight intensity={0.28} />
      <Sun center={center} intensity={lightIntensity} />

      <Floors3D plan={plan} />
      <Walls3D plan={plan} />
      <FurnitureAll plan={plan} />

      <gridHelper args={[60000, 60, '#bfc6cd', '#d7dde2']} position={[center.x, -12, center.y]} />

      <CameraRig center={center} />
      <GlRegistrar />
    </Canvas>
  )
}

/** 현재 3D 뷰를 dataURL로 캡처 (배치안 썸네일 등) */
export function captureThumb(width = 280): string | undefined {
  const gl = (window as unknown as Record<string, unknown>).__hp3d_gl as
    | (THREE.WebGLRenderer & { domElement: HTMLCanvasElement })
    | undefined
  if (!gl) return undefined
  try {
    const src = gl.domElement
    const ratio = width / src.width
    const c = document.createElement('canvas')
    c.width = width
    c.height = Math.round(src.height * ratio)
    const ctx = c.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(src, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.72)
  } catch {
    return undefined
  }
}

/** 고해상도 스크린샷 다운로드 */
export function screenshot3d(filename = 'homeplan3d.png') {
  const gl = (window as unknown as Record<string, unknown>).__hp3d_gl as
    | (THREE.WebGLRenderer & { domElement: HTMLCanvasElement })
    | undefined
  if (!gl) return
  const url = gl.domElement.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
