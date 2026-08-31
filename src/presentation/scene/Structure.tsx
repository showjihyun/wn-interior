// ─────────────────────────────────────────────────────────────
// 구조물 렌더: 벽(개구부 슬라이스) + 문/창문 + 방 바닥(마감재)
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import * as THREE from 'three'
import type { FloorPlan, Opening } from '../../domain/model'
import { useAppRuntime } from '../AppRuntimeContext'
import { getTexture, cloneWithRepeat } from './textures'
import { wallLength, wallAngle } from '../../domain/engine/geom'
import { buildWallSlices, resolveWallMaterialId } from '../../domain/structureProjection'

const DEFAULT_WALL = 'w-silk-white'

export function Walls3D({ plan }: { plan: FloorPlan }) {
  const { finishMaterials } = useAppRuntime()
  return (
    <group>
      {plan.walls.map((w) => {
        const L = wallLength(w)
        const ang = wallAngle(w)
        const rotY = Math.atan2(-(w.b.y - w.a.y), w.b.x - w.a.x)
        const cx = (w.a.x + w.b.x) / 2
        const cy = (w.a.y + w.b.y) / 2
        const ops = plan.openings.filter((o) => o.wallId === w.id)
        const matId = resolveWallMaterialId(plan, cx, cy, ang) ?? DEFAULT_WALL
        const mat =
          finishMaterials.find((material) => material.id === matId) ??
          finishMaterials.find((material) => material.id === DEFAULT_WALL)!
        const baseTex = getTexture(mat)
        baseTex.userData.tileMm = mat.tileMm
        const slices = buildWallSlices(L, plan.wallHeight, ops)
        return (
          <group key={w.id} position={[cx, 0, cy]} rotation={[0, rotY, 0]}>
            {slices.map((s, i) => (
              <mesh
                key={i}
                castShadow
                receiveShadow
                position={[-L / 2 + s.start + s.len / 2, s.yBase + s.hgt / 2, 0]}
              >
                <boxGeometry args={[Math.max(s.len, 1), Math.max(s.hgt, 1), w.thickness]} />
                <meshStandardMaterial
                  map={cloneWithRepeat(baseTex, s.len / mat.tileMm, s.hgt / mat.tileMm)}
                  roughness={0.92}
                />
              </mesh>
            ))}
            {ops.map((o) => (
              <OpeningMesh
                key={o.id}
                op={o}
                thickness={w.thickness}
                localOffsetFromCenter={-L / 2}
              />
            ))}
          </group>
        )
      })}
    </group>
  )
}

function OpeningMesh({
  op,
  thickness,
  localOffsetFromCenter,
}: {
  op: Opening
  thickness: number
  localOffsetFromCenter: number
}) {
  const x = localOffsetFromCenter + op.offset + op.width / 2
  const frameC = op.type === 'entry' ? '#4a3b2c' : '#efece6'
  const leafC = op.type === 'entry' ? '#5a4634' : '#dfe3e6'
  if (op.type === 'window') {
    const t = 60
    return (
      <group position={[x, 0, 0]}>
        {/* 프레임 */}
        <mesh castShadow position={[0, op.sill + op.height + t / 2, 0]}>
          <boxGeometry args={[op.width + t * 2, t, thickness + 20]} />
          <meshStandardMaterial color={frameC} roughness={0.6} />
        </mesh>
        <mesh position={[0, op.sill - t / 2, 0]}>
          <boxGeometry args={[op.width + t * 2, t, thickness + 40]} />
          <meshStandardMaterial color={frameC} roughness={0.6} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * (op.width + t)) / 2, op.sill + op.height / 2, 0]}>
            <boxGeometry args={[t, op.height, thickness + 20]} />
            <meshStandardMaterial color={frameC} roughness={0.6} />
          </mesh>
        ))}
        {/* 유리 */}
        <mesh position={[0, op.sill + op.height / 2, 0]}>
          <boxGeometry args={[op.width, op.height, 14]} />
          <meshPhysicalMaterial
            color="#bcd7e4"
            transparent
            opacity={0.32}
            roughness={0.05}
            metalness={0.1}
          />
        </mesh>
        {/* 중간 창살 */}
        <mesh position={[0, op.sill + op.height / 2, 0]}>
          <boxGeometry args={[26, op.height, 18]} />
          <meshStandardMaterial color={frameC} roughness={0.6} />
        </mesh>
      </group>
    )
  }
  // 문 (닫힌 상태 + 문틀)
  return (
    <group position={[x, 0, 0]}>
      <mesh castShadow position={[0, op.height + 25, 0]}>
        <boxGeometry args={[op.width + 100, 50, thickness + 30]} />
        <meshStandardMaterial color={frameC} roughness={0.65} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[(s * (op.width + 50)) / 2, op.height / 2, 0]}>
          <boxGeometry args={[50, op.height + 20, thickness + 30]} />
          <meshStandardMaterial color={frameC} roughness={0.65} />
        </mesh>
      ))}
      {/* 짐 */}
      <mesh castShadow position={[0, op.height / 2, 0]}>
        <boxGeometry args={[op.width - 24, op.height - 24, 45]} />
        <meshStandardMaterial color={leafC} roughness={0.55} />
      </mesh>
      {/* 손잡이 */}
      <mesh
        position={[op.width / 2 - 130, 1050, thickness / 2 + 30]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[22, 22, 90, 16]} />
        <meshStandardMaterial color="#8f959b" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )
}

export function Floors3D({ plan }: { plan: FloorPlan }) {
  const { finishMaterials } = useAppRuntime()
  const shapes = useMemo(() => {
    return plan.rooms.map((r) => {
      const shape = new THREE.Shape(r.polygon.map((pt) => new THREE.Vector2(pt.x, pt.y)))
      const geo = new THREE.ShapeGeometry(shape)
      geo.rotateX(Math.PI / 2) // 평면(x,y) → 월드(x,z), DoubleSide로 위/아래 모두
      return { r, geo }
    })
  }, [plan.rooms])

  return (
    <group>
      {shapes.map(({ r, geo }) => {
        const mat =
          finishMaterials.find((material) => material.id === r.floorMaterialId) ??
          finishMaterials.find((material) => material.id === 'f-vinyl-oak')!
        const tex = getTexture(mat)
        const rep = 1 / mat.tileMm
        return (
          <mesh key={r.id} geometry={geo} receiveShadow>
            <meshStandardMaterial
              map={cloneWithRepeat(tex, rep, rep)}
              roughness={mat.kind === 'floor' && mat.tex.startsWith('tile') ? 0.35 : 0.75}
              side={THREE.DoubleSide}
            />
          </mesh>
        )
      })}
    </group>
  )
}
