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
import { WalkControls as WalkControlsNew } from './WalkControls'

function CameraRig({ center }: { center: { x: number; y: number } }) {
  const preset = useStore((s) => s.viewPreset)
  const plan = useStore((s) => s.plan)
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

  if (preset === 'walk') return <WalkControlsNew plan={plan} />
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
