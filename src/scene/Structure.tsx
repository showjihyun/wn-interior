// ─────────────────────────────────────────────────────────────
// 구조물 렌더: 벽(개구부 슬라이스) + 문/창문 + 방 바닥(마감재)
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import * as THREE from 'three'
import type { FloorPlan, Opening, Room } from '../types'
import { getMaterial } from '../data/materials'
import { getTexture, cloneWithRepeat } from '../engine/textures'
import { wallLength, wallAngle } from '../engine/geom'

const DEFAULT_WALL = 'w-silk-white'

function wallMaterialId(plan: FloorPlan, midX: number, midY: number, ang: number): string | undefined {
  const off = 150
  const nx = -Math.sin(ang) * off
  const ny = Math.cos(ang) * off
  for (const s of [1, -1]) {
    const px = midX + nx * s
    const py = midY + ny * s
    const room = plan.rooms.find((r) => pointInside(r, px, py))
    if (room?.wallMaterialId) return room.wallMaterialId
  }
  return undefined
}

function pointInside(r: Room, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = r.polygon.length - 1; i < r.polygon.length; j = i++) {
    const xi = r.polygon[i].x
    const yi = r.polygon[i].y
    const xj = r.polygon[j].x
    const yj = r.polygon[j].y
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

interface Slice {
  len: number
  hgt: number
  yBase: number
  start: number // 벽 로컬 x 시작
}

function buildSlices(L: number, H: number, ops: Opening[]): Slice[] {
  const slices: Slice[] = []
  const sorted = [...ops].sort((p, q) => p.offset - q.offset)
  let cursor = 0
  for (const o of sorted) {
    const s = Math.max(cursor, o.offset)
    const e = Math.min(L, o.offset + o.width)
    if (e <= s) continue
    if (s > cursor) slices.push({ len: s - cursor, hgt: H, yBase: 0, start: cursor })
    // 창문 하단
    if (o.sill > 0) slices.push({ len: e - s, hgt: o.sill, yBase: 0, start: s })
    // 상단 잔벽
    const topStart = Math.min(H, o.sill + o.height)
    if (H > topStart) slices.push({ len: e - s, hgt: H - topStart, yBase: topStart, start: s })
    cursor = e
  }
  if (cursor < L) slices.push({ len: L - cursor, hgt: H, yBase: 0, start: cursor })
  return slices
}

export function Walls3D({ plan }: { plan: FloorPlan }) {
  return (
    <group>
      {plan.walls.map((w) => {
        const L = wallLength(w)
        const ang = wallAngle(w)
        const rotY = Math.atan2(-(w.b.y - w.a.y), w.b.x - w.a.x)
        const cx = (w.a.x + w.b.x) / 2
        const cy = (w.a.y + w.b.y) / 2
        const ops = plan.openings.filter((o) => o.wallId === w.id)
        const matId = wallMaterialId(plan, cx, cy, ang) ?? DEFAULT_WALL
        const mat = getMaterial(matId)!
        const baseTex = getTexture(mat)
        baseTex.userData.tileMm = mat.tileMm
        const slices = buildSlices(L, plan.wallHeight, ops)
        return (
          <group key={w.id} position={[cx, 0, cy]} rotation={[0, rotY, 0]}>
            {slices.map((s, i) => (
              <mesh key={i} castShadow receiveShadow position={[-L / 2 + s.start + s.len / 2, s.yBase + s.hgt / 2, 0]}>
                <boxGeometry args={[Math.max(s.len, 1), Math.max(s.hgt, 1), w.thickness]} />
                <meshStandardMaterial map={cloneWithRepeat(baseTex, s.len / mat.tileMm, s.hgt / mat.tileMm)} roughness={0.92} />
              </mesh>
            ))}
            {ops.map((o) => (
              <OpeningMesh key={o.id} op={o} thickness={w.thickness} localOffsetFromCenter={-L / 2} />
            ))}
          </group>
        )
      })}
    </group>
  )
}

function OpeningMesh({ op, thickness, localOffsetFromCenter }: { op: Opening; thickness: number; localOffsetFromCenter: number }) {
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
          <meshPhysicalMaterial color="#bcd7e4" transparent opacity={0.32} roughness={0.05} metalness={0.1} />
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
      <mesh position={[op.width / 2 - 130, 1050, thickness / 2 + 30]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[22, 22, 90, 16]} />
        <meshStandardMaterial color="#8f959b" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )
}

export function Floors3D({ plan }: { plan: FloorPlan }) {
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
        const mat = getMaterial(r.floorMaterialId) ?? getMaterial('f-vinyl-oak')!
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
