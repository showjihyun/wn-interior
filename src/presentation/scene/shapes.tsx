// ─────────────────────────────────────────────────────────────
// 파라메트릭 가구 셰이프 — 실측 dims(mm)를 그대로 박스 조합으로 재현
// 규약: 원점=바닥 중심, 로컬 +z=정면(앞), 뒷면 -z (벽 부착 시 벽쪽)
// 천장 부착(pendant)만 예외: 원점=천장, 아래로 -y 확장
// ─────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import type { Product } from '../../domain/model'
import { createGatelegTableProfile } from './gatelegTableProfile'
import { createHighBedFrameProfile } from './highBedFrameProfile'
import { createKivikSofaProfile } from './kivikSofaProfile'
import { createModularWardrobeProfile } from './modularWardrobeProfile'
import { createOpenBookcaseProfile } from './openBookcaseProfile'
import { createShelfCoffeeTableProfile } from './shelfCoffeeTableProfile'
import { createTableGlobeLampProfile } from './tableGlobeLampProfile'

interface BoxProps {
  size: [number, number, number]
  pos: [number, number, number]
  color?: string
  rough?: number
  metal?: number
  opacity?: number
}

/** y는 바닥 기준(밑면), 내부에서 중심 보정 */
function Box({ size, pos, color = '#ccc', rough = 0.8, metal = 0, opacity }: BoxProps): ReactNode {
  return (
    <mesh castShadow receiveShadow position={[pos[0], pos[1] + size[1] / 2, pos[2]]}>
      <boxGeometry args={[size[0], size[1], size[2]]} />
      <meshStandardMaterial
        color={color}
        roughness={rough}
        metalness={metal}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
      />
    </mesh>
  )
}

function Cyl({
  rTop,
  rBot,
  h,
  pos,
  color,
  rotZ,
  rotX,
}: {
  rTop: number
  rBot: number
  h: number
  pos: [number, number, number]
  color?: string
  rotZ?: number
  rotX?: number
}): ReactNode {
  return (
    <mesh castShadow receiveShadow position={pos} rotation={[rotX ?? 0, 0, rotZ ?? 0]}>
      <cylinderGeometry args={[rTop, rBot, h, 24]} />
      <meshStandardMaterial color={color ?? '#888'} roughness={0.6} metalness={0.3} />
    </mesh>
  )
}

const DARK = '#2f3237'
const STONE = '#d8d4cb'
const STEEL = '#b8bec4'

type ShapeProps = { p: Product; c?: string }

export function Shape({ kind, p, c }: { kind: Product['shape'] } & ShapeProps): ReactNode {
  const { w, d, h } = p.dims
  switch (kind) {
    case 'kivikSofa': {
      const profile = createKivikSofaProfile(p.dims)
      return (
        <group
          userData={{
            shapeKind: 'kivikSofa',
            seatWidth: profile.seatWidth,
            seatDepth: profile.seatDepth,
            seatHeight: profile.seatHeight,
            armWidth: profile.armWidth,
            seatCushionCount: profile.seatCushionCount,
            backCushionCount: profile.backCushionCount,
          }}
        >
          {profile.parts.map((part, index) => (
            <Box
              key={`${part.role}-${index}`}
              size={part.size}
              pos={part.position}
              color={
                part.role === 'foot'
                  ? DARK
                  : part.role === 'seatCushion' || part.role === 'backCushion'
                    ? shade(c, 18)
                    : part.role === 'frame'
                      ? shade(c, -12)
                      : c
              }
              rough={part.role === 'foot' ? 0.5 : 0.92}
            />
          ))}
        </group>
      )
    }
    case 'sofa3':
    case 'armchair': {
      const armW = Math.min(w * 0.12, 200)
      const backT = d * 0.22
      const seatH = h * 0.5
      return (
        <group>
          {/* 등받이 */}
          <Box size={[w, h, backT]} pos={[0, 0, -d / 2]} color={c} />
          {/* 좌석 */}
          <Box
            size={[w - armW * 2, seatH, d - backT]}
            pos={[0, 0, -d / 2 + backT + (d - backT) / 2]}
            color={shade(c, 14)}
            rough={0.95}
          />
          {/* 팔걸이 */}
          <Box size={[armW, h * 0.78, d]} pos={[-w / 2 + armW / 2, 0, 0]} color={c} />
          <Box size={[armW, h * 0.78, d]} pos={[w / 2 - armW / 2, 0, 0]} color={c} />
          {/* 쿠션 */}
          {(kind === 'sofa3' ? [-1, 0, 1] : [0]).map((k) => (
            <Box
              key={k}
              size={[(w - armW * 2) / (kind === 'sofa3' ? 3 : 1) - 20, 90, (d - backT) * 0.55]}
              pos={[k * ((w - armW * 2) / 3), seatH, d / 2 - (d - backT) * 0.28]}
              color={shade(c, 30)}
              rough={0.95}
            />
          ))}
        </group>
      )
    }
    case 'coffeeTable':
    case 'diningTable': {
      const topT = kind === 'coffeeTable' ? 40 : 45
      const leg = kind === 'coffeeTable' ? 40 : 60
      const lx = w / 2 - leg * 1.6
      const lz = d / 2 - leg * 1.6
      return (
        <group>
          <Box size={[w, topT, d]} pos={[0, h - topT, 0]} color={c} rough={0.55} />
          {[
            [-lx, -lz],
            [lx, -lz],
            [-lx, lz],
            [lx, lz],
          ].map(([x, z], i) => (
            <Box key={i} size={[leg, h - topT, leg]} pos={[x, 0, z]} color={shade(c, -25)} />
          ))}
        </group>
      )
    }
    case 'shelfCoffeeTable': {
      const profile = createShelfCoffeeTableProfile(p.dims)
      return (
        <group
          userData={{
            shapeKind: 'shelfCoffeeTable',
            shelfCount: profile.shelfCount,
            legCount: profile.legCount,
          }}
        >
          {profile.parts.map((part, index) => (
            <Box
              key={`${part.role}-${index}`}
              size={part.size}
              pos={part.position}
              color={part.role === 'shelf' ? shade(c, 8) : c}
              rough={0.58}
            />
          ))}
        </group>
      )
    }
    case 'gatelegTable': {
      const profile = createGatelegTableProfile(p.dims, {
        collapsedLength: 260,
        expandedLength: 1520,
      })
      return (
        <group
          userData={{
            shapeKind: 'gatelegTable',
            collapsedLength: profile.collapsedLength,
            normalLength: profile.normalLength,
            expandedLength: profile.expandedLength,
            openLeafCount: profile.parts.filter((part) => part.role === 'openLeaf').length,
            foldedLeafCount: profile.parts.filter((part) => part.role === 'foldedLeaf').length,
          }}
        >
          {profile.parts.map((part, index) => (
            <Box
              key={`${part.role}-${index}`}
              size={part.size}
              pos={part.position}
              color={
                part.role === 'drawer'
                  ? shade(c, 10)
                  : part.role === 'gateLeg' || part.role === 'cabinet'
                    ? shade(c, -18)
                    : c
              }
              rough={part.role === 'centerTop' || part.role === 'openLeaf' ? 0.5 : 0.72}
            />
          ))}
        </group>
      )
    }
    case 'chair': {
      const seatY = h * 0.5
      const leg = 35
      return (
        <group>
          <Box size={[w - 10, 45, d * 0.55]} pos={[0, seatY - 45, d * 0.18]} color={c} />
          <Box size={[w, h - seatY, 35]} pos={[0, seatY, -d / 2 + 17]} color={c} />
          {[
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([sx, sz], i) => (
            <Box
              key={i}
              size={[leg, seatY - 45, leg]}
              pos={[sx * (w / 2 - 50), 0, sz * (d / 2 - 55)]}
              color={shade(c, -30)}
            />
          ))}
        </group>
      )
    }
    case 'highBedFrame': {
      const profile = createHighBedFrameProfile(p.dims, {
        footboardHeight: 380,
        clearance: 210,
      })
      return (
        <group
          userData={{
            shapeKind: 'highBedFrame',
            includesMattress: profile.includesMattress,
            includesSlattedBase: profile.includesSlattedBase,
            midbeamIncluded: profile.midbeamIncluded,
          }}
        >
          {profile.parts.map((part, index) => (
            <Box
              key={`${part.role}-${index}`}
              size={part.size}
              pos={part.position}
              color={part.role === 'midbeam' ? STEEL : c}
              rough={part.role === 'midbeam' ? 0.35 : 0.64}
              metal={part.role === 'midbeam' ? 0.7 : 0}
            />
          ))}
        </group>
      )
    }
    case 'bed': {
      const headT = 90
      const frameH = 250
      const matH = 220
      const pillowD = 380
      return (
        <group>
          {/* 헤드보드 */}
          <Box size={[w, h, headT]} pos={[0, 0, -d / 2]} color={shade(c, -15)} rough={0.7} />
          {/* 프레임 */}
          <Box
            size={[w, frameH, d - headT]}
            pos={[0, 0, -d / 2 + headT + (d - headT) / 2]}
            color={shade(c, -25)}
          />
          {/* 매트리스 */}
          <Box
            size={[w - 80, matH, d - headT - 60]}
            pos={[0, frameH, -d / 2 + headT + 20 + (d - headT - 60) / 2]}
            color="#f4f2ec"
            rough={0.95}
          />
          {/* 이불 */}
          <Box
            size={[w - 70, 90, (d - headT) * 0.62]}
            pos={[0, frameH + matH - 40, d / 2 - (d - headT) * 0.33]}
            color={c}
            rough={0.98}
          />
          {/* 베개 */}
          {[-1, 1].map((s) =>
            w > 1400 ? (
              <Box
                key={s}
                size={[w / 2 - 130, 110, pillowD]}
                pos={[s * (w / 4), frameH + matH - 30, -d / 2 + headT + 240]}
                color="#ffffff"
                rough={0.98}
              />
            ) : null
          )}
        </group>
      )
    }
    case 'wardrobe': {
      return (
        <group>
          <Box size={[w, h, d]} pos={[0, 0, 0]} color={c} rough={0.65} />
          {/* 문 틈새 */}
          <Box size={[6, h - 60, 8]} pos={[0, 30, d / 2 - 2]} color={shade(c, -60)} />
          {[-1, 1].map((s) => (
            <Cyl
              key={s}
              rTop={12}
              rBot={12}
              h={280}
              pos={[s * 60, h * 0.42, d / 2 + 14]}
              color={STEEL}
              rotX={Math.PI / 2}
            />
          ))}
        </group>
      )
    }
    case 'modularWardrobe': {
      const profile = createModularWardrobeProfile(p.dims, {
        frameCount: 2,
        doorCount: 4,
        doorHeight: 1950,
      })
      return (
        <group
          userData={{
            shapeKind: 'modularWardrobe',
            frameCount: profile.frameCount,
            doorCount: profile.doorCount,
            handlesIncluded: profile.handlesIncluded,
          }}
        >
          {profile.parts.map((part, index) => (
            <Box
              key={`${part.role}-${index}`}
              size={part.size}
              pos={part.position}
              color={
                part.role === 'door' ? shade(c, 8) : part.role === 'plinth' ? shade(c, -18) : c
              }
              rough={part.role === 'door' ? 0.5 : 0.7}
            />
          ))}
        </group>
      )
    }
    case 'openBookcase': {
      const profile = createOpenBookcaseProfile(p.dims)
      return (
        <group userData={{ shapeKind: 'openBookcase', shelfCount: profile.shelfCount }}>
          {profile.parts.map((part, index) => (
            <Box
              key={`${part.role}-${index}`}
              size={part.size}
              pos={part.position}
              color={part.role === 'back' ? shade(c, -8) : c}
              rough={part.role === 'back' ? 0.9 : 0.68}
            />
          ))}
        </group>
      )
    }
    case 'dresser': {
      const n = h > 1200 ? 4 : 5
      const dh = (h - 60) / n
      return (
        <group>
          <Box size={[w, 40, d + 16]} pos={[0, h - 40, 0]} color={shade(c, 10)} rough={0.5} />
          {Array.from({ length: n }, (_, i) => (
            <group key={i}>
              <Box size={[w - 24, dh - 14, d]} pos={[12, 20 + i * dh, 0]} color={c} rough={0.7} />
              <Box
                size={[140, 16, 14]}
                pos={[w / 2 - 100, 20 + i * dh + dh / 2 - 26, d / 2 + 6]}
                color={STEEL}
              />
            </group>
          ))}
        </group>
      )
    }
    case 'sideTable':
      return (
        <group>
          <Box size={[w, 30, d + 10]} pos={[0, h - 30, 0]} color={shade(c, 10)} rough={0.5} />
          <Box size={[w - 30, h - 60, d - 20]} pos={[15, 20, 0]} color={c} />
          <Box size={[w - 30, 16, d - 20]} pos={[15, h - 46, 0]} color={shade(c, -20)} />
        </group>
      )
    case 'tvStand': {
      const cabH = 450
      const tvW = Math.min(w * 0.92, 1460)
      const tvH = h - cabH
      return (
        <group>
          <Box size={[w, cabH, d]} pos={[0, 0, 0]} color={c} rough={0.6} />
          <Box size={[w - 300, 12, d + 6]} pos={[150, cabH * 0.55, 0]} color={shade(c, -40)} />
          {/* TV */}
          <Box
            size={[tvW, tvH, 36]}
            pos={[0, cabH + 40, 0]}
            color="#101216"
            rough={0.35}
            metal={0.4}
          />
          <Box
            size={[tvW - 44, tvH - 44, 6]}
            pos={[0, cabH + 58, 20]}
            color="#1a2027"
            rough={0.15}
            metal={0.6}
          />
          <Box size={[tvW * 0.3, 30, 60]} pos={[0, cabH, 0]} color="#101216" />
        </group>
      )
    }
    case 'tvWall':
      return (
        <group>
          <Box size={[w, h, d * 0.4]} pos={[0, 0, 0]} color="#101216" rough={0.4} metal={0.3} />
          <Box
            size={[w - 40, h - 40, 8]}
            pos={[0, 20, d * 0.4]}
            color="#16202b"
            rough={0.1}
            metal={0.7}
          />
        </group>
      )
    case 'inductionHob': {
      const ringRadius = Math.min(w, d) * 0.17
      return (
        <group>
          <Box size={[w, h, d]} pos={[0, 0, 0]} color="#ececea" rough={0.35} metal={0.1} />
          <Box
            size={[w * 0.94, Math.max(8, h * 0.14), d * 0.92]}
            pos={[0, h - Math.max(8, h * 0.14), 0]}
            color="#17191c"
            rough={0.14}
            metal={0.25}
          />
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * w * 0.23, h + 2, -d * 0.02]}>
              <cylinderGeometry args={[ringRadius, ringRadius, 3, 40]} />
              <meshStandardMaterial color="#34383e" roughness={0.25} metalness={0.2} />
            </mesh>
          ))}
        </group>
      )
    }
    case 'faucet': {
      const radius = Math.max(12, Math.min(w, d) * 0.055)
      return (
        <group>
          <Cyl rTop={radius * 1.7} rBot={radius * 1.9} h={40} pos={[0, 20, 0]} color={STEEL} />
          <Cyl rTop={radius} rBot={radius} h={h * 0.64} pos={[0, h * 0.34, 0]} color={STEEL} />
          <Cyl
            rTop={radius * 0.9}
            rBot={radius * 0.9}
            h={d * 0.58}
            pos={[0, h * 0.66, d * 0.22]}
            color={STEEL}
            rotX={Math.PI / 2}
          />
          <Cyl
            rTop={radius * 0.95}
            rBot={radius * 0.95}
            h={h * 0.22}
            pos={[0, h * 0.58, d * 0.5]}
            color={STEEL}
          />
        </group>
      )
    }
    case 'kitchenSink': {
      const rim = Math.max(18, Math.min(w, d) * 0.045)
      return (
        <group>
          <Box
            size={[w, Math.max(24, h * 0.16), d]}
            pos={[0, h * 0.84, 0]}
            color="#242629"
            rough={0.4}
          />
          <Box
            size={[w - rim * 2, h * 0.82, d - rim * 2]}
            pos={[0, 0, 0]}
            color="#15171a"
            rough={0.36}
          />
          <mesh position={[0, 10, 0]}>
            <cylinderGeometry args={[30, 30, 10, 32]} />
            <meshStandardMaterial color={STEEL} roughness={0.22} metalness={0.8} />
          </mesh>
        </group>
      )
    }
    case 'sinkLower': {
      const counterT = 50
      return (
        <group>
          <Box size={[w, h - counterT, d - 40]} pos={[0, 0, -20]} color={c} rough={0.6} />
          <Box size={[w, counterT, d]} pos={[0, h - counterT, 0]} color={STONE} rough={0.35} />
          {/* 싱크홀 */}
          <Box
            size={[w * 0.32, 12, d * 0.4]}
            pos={[-w * 0.22, h - 4, d * 0.05]}
            color="#9fa4a8"
            rough={0.3}
            metal={0.6}
          />
          <Box
            size={[w * 0.2, 12, d * 0.34]}
            pos={[w * 0.28, h - 4, d * 0.02]}
            color="#2c2f33"
            rough={0.4}
            metal={0.4}
          />
          {!p.retail?.excluded.includes('수전') && (
            <>
              <Cyl rTop={14} rBot={14} h={260} pos={[0, h, -d / 2 + 60]} color={STEEL} />
              <Cyl
                rTop={11}
                rBot={11}
                h={180}
                pos={[0, h + 250, -d / 2 + 150]}
                color={STEEL}
                rotX={Math.PI / 2}
              />
            </>
          )}
          {/* 문 손잡이 라인 */}
          <Box size={[w - 60, 14, 12]} pos={[30, h - counterT - 120, d / 2 - 26]} color={STEEL} />
        </group>
      )
    }
    case 'sinkUpper':
      return (
        <group>
          <Box size={[w, h, d]} pos={[0, 0, 0]} color={c} rough={0.5} />
          <Box
            size={[w - 40, h - 80, 6]}
            pos={[20, 40, d / 2 + 1]}
            color="#bcd2dd"
            rough={0.1}
            metal={0.2}
            opacity={0.45}
          />
          <Box size={[w - 80, 16, 16]} pos={[40, -24, d / 2 + 8]} color={STEEL} />
        </group>
      )
    case 'fridge':
      return (
        <group>
          <Box size={[w, h, d]} pos={[0, 0, 0]} color={c} rough={0.35} metal={0.5} />
          <Box size={[6, h - 120, 10]} pos={[0, 100, d / 2 + 1]} color={shade(c, -50)} />
          {[-1, 1].map((s) => (
            <Box
              key={s}
              size={[16, 500, 26]}
              pos={[s * 70, h * 0.38, d / 2 + 12]}
              color={shade(c, -60)}
              rough={0.3}
              metal={0.6}
            />
          ))}
        </group>
      )
    case 'rug':
      return (
        <group>
          <mesh receiveShadow position={[0, 6, 0]}>
            <boxGeometry args={[w, 12, d]} />
            <meshStandardMaterial color={c} roughness={1} />
          </mesh>
          <mesh receiveShadow position={[0, 13, 0]}>
            <boxGeometry args={[w - 160, 4, d - 160]} />
            <meshStandardMaterial color={shade(c, -18)} roughness={1} />
          </mesh>
        </group>
      )
    case 'shoeCabinet':
      return (
        <group>
          <Box size={[w, h, d]} pos={[0, 0, 0]} color={c} rough={0.6} />
          <Box size={[4, h - 80, 8]} pos={[0, 40, d / 2 - 1]} color={shade(c, -55)} />
          <Box size={[w + 20, 30, d + 20]} pos={[-10, h, -10]} color={shade(c, 12)} rough={0.5} />
          <Box size={[120, 14, 14]} pos={[w / 2 - 90, h * 0.55, d / 2 + 6]} color={STEEL} />
        </group>
      )
    case 'desk':
      return (
        <group>
          <Box size={[w, 40, d]} pos={[0, h - 40, 0]} color={c} rough={0.55} />
          <Box size={[36, h - 40, d - 60]} pos={[w / 2 - 36, 0, 0]} color={shade(c, -15)} />
          <Box size={[36, h - 40, d - 60]} pos={[-w / 2 + 36, 0, 0]} color={shade(c, -15)} />
          {/* 모니터 데코 */}
          <Box size={[560, 340, 24]} pos={[0, h, 40]} color="#14171b" rough={0.3} />
          <Cyl rTop={30} rBot={90} h={30} pos={[0, h - 10, 60]} color="#14171b" />
        </group>
      )
    case 'shelfWall':
      return (
        <group>
          <Box size={[w, 28, d]} pos={[0, 0, 0]} color={c} rough={0.6} />
          <Box size={[24, 40, d * 0.7]} pos={[-w / 2 + 60, -40, 0]} color={shade(c, -30)} />
          <Box size={[24, 40, d * 0.7]} pos={[w / 2 - 60, -40, 0]} color={shade(c, -30)} />
          {/* 책 데코 */}
          {[-2, -1, 0, 1].map((k, i) => (
            <Box
              key={i}
              size={[52, 190 + i * 14, d * 0.72]}
              pos={[k * 90 + 30, 28, 0]}
              color={['#7a6455', '#4a5568', '#8c6f5a', '#5c6f63'][i]}
              rough={0.9}
            />
          ))}
        </group>
      )
    case 'washer':
      return (
        <group>
          <Box size={[w, h, d]} pos={[0, 0, 0]} color={c} rough={0.35} metal={0.3} />
          <mesh castShadow position={[0, h * 0.42, d / 2 + 4]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[w * 0.27, w * 0.27, 14, 32]} />
            <meshStandardMaterial color="#3a4149" roughness={0.15} metalness={0.5} />
          </mesh>
          <Box size={[w - 80, 60, 8]} pos={[40, h - 80, d / 2 + 2]} color="#e8e8ea" />
        </group>
      )
    case 'ac':
      return (
        <group>
          <Box size={[w, h, d]} pos={[0, 0, 0]} color="#f4f4f2" rough={0.4} />
          <Box size={[w - 100, 24, 10]} pos={[50, 20, d / 2]} color="#c9ccd0" />
          <Box size={[w * 0.3, 8, 4]} pos={[w * 0.2, h - 60, d / 2 + 1]} color="#7fb069" />
        </group>
      )
    case 'microwave':
      return (
        <group>
          <Box size={[w, h, d]} pos={[0, 0, 0]} color={c} rough={0.4} metal={0.3} />
          <Box
            size={[w * 0.55, h * 0.6, 6]}
            pos={[w * 0.16, h * 0.2, d / 2 + 1]}
            color="#1c2126"
            rough={0.1}
          />
          <Box size={[60, h * 0.5, 10]} pos={[w / 2 - 60, h * 0.25, d / 2 + 3]} color={STEEL} />
        </group>
      )
    case 'pendant': {
      // 원점 = 천장, 아래로 음수 y
      const cordL = h - 260
      return (
        <group>
          <Cyl rTop={10} rBot={10} h={cordL} pos={[0, -cordL / 2, 0]} color={DARK} />
          <mesh castShadow position={[0, -(cordL + 130), 0]}>
            <cylinderGeometry args={[w * 0.28, w * 0.5, 260, 32, 1, true]} />
            <meshStandardMaterial color={c} roughness={0.5} side={THREE_DOUBLE_SIDE} />
          </mesh>
          <mesh position={[0, -(cordL + 240), 0]}>
            <sphereGeometry args={[60, 16, 16]} />
            <meshStandardMaterial color="#fff3d6" emissive="#ffe9b0" emissiveIntensity={1.4} />
          </mesh>
        </group>
      )
    }
    case 'floorLamp': {
      return (
        <group>
          <Cyl rTop={110} rBot={130} h={20} pos={[0, 0, 0]} color={DARK} />
          <Cyl rTop={14} rBot={14} h={h - 320} pos={[0, (h - 320) / 2 + 10, 0]} color={DARK} />
          <mesh castShadow position={[0, h - 170, 0]}>
            <cylinderGeometry args={[w * 0.32, w * 0.5, 300, 28, 1, true]} />
            <meshStandardMaterial color={c} roughness={0.6} side={THREE_DOUBLE_SIDE} />
          </mesh>
        </group>
      )
    }
    case 'tableGlobeLamp': {
      const profile = createTableGlobeLampProfile(p.dims)
      return (
        <group userData={{ shapeKind: 'tableGlobeLamp' }}>
          <Cyl
            rTop={profile.base.radius}
            rBot={profile.base.radius * 1.08}
            h={profile.base.height}
            pos={[0, profile.base.centerY, 0]}
            color={DARK}
          />
          <mesh
            castShadow
            position={[0, profile.globe.centerY, 0]}
            scale={[profile.globe.radiusX, profile.globe.radiusY, profile.globe.radiusZ]}
          >
            <sphereGeometry args={[1, 32, 24]} />
            <meshStandardMaterial
              color={c ?? '#f5f0e0'}
              emissive="#fff0c2"
              emissiveIntensity={0.42}
              roughness={0.28}
              metalness={0}
              transparent
              opacity={0.82}
              depthWrite={false}
            />
          </mesh>
          <pointLight
            position={[0, profile.globe.centerY, 0]}
            color="#ffe5ae"
            intensity={0.22}
            distance={700}
            decay={2}
          />
        </group>
      )
    }
    case 'toilet':
      return (
        <group>
          <Box size={[w, 380, 170]} pos={[0, 420, -d / 2 + 85]} color="#fafafa" rough={0.3} />
          <Box
            size={[w * 0.96, 400, d * 0.62]}
            pos={[w * 0.02, 0, -d * 0.08]}
            color="#fafafa"
            rough={0.25}
          />
          <mesh
            castShadow
            position={[0, 410, d * 0.12]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[1, 1.25, 1]}
          >
            <cylinderGeometry args={[w * 0.48, w * 0.44, 45, 24]} />
            <meshStandardMaterial color="#ffffff" roughness={0.2} />
          </mesh>
          <Box size={[90, 30, 120]} pos={[w / 2 - 110, 750, -d / 2 + 85]} color={STEEL} />
        </group>
      )
    case 'washbasin': {
      const cabH = 780
      return (
        <group>
          <Box size={[w, cabH, 460]} pos={[0, 0, -d / 2 + 230]} color={c} rough={0.4} />
          <mesh castShadow position={[0, cabH + 60, -d / 2 + 210]} scale={[1.15, 1, 0.85]}>
            <cylinderGeometry args={[w * 0.3, w * 0.24, 120, 28]} />
            <meshStandardMaterial color="#ffffff" roughness={0.2} />
          </mesh>
          <Cyl
            rTop={12}
            rBot={12}
            h={200}
            pos={[0, cabH + 120, -d / 2 + 120]}
            color={STEEL}
            rotX={Math.PI / 4}
          />
          {/* 거울 */}
          <Box
            size={[w - 60, h - cabH - 220, 26]}
            pos={[0, cabH + 200, -d / 2 + 13]}
            color="#cfe0e8"
            rough={0.05}
            metal={0.9}
          />
        </group>
      )
    }
    case 'islandBar':
      return (
        <group>
          <Box size={[w, 40, d]} pos={[0, h - 40, 0]} color={c} rough={0.5} />
          <Box
            size={[w - 120, h - 40, d - 120]}
            pos={[60, 0, 0]}
            color={shade(c, -40)}
            rough={0.7}
          />
        </group>
      )
    case 'robotVacuum': {
      const r = Math.min(w, d) / 2
      return (
        <group>
          <mesh castShadow receiveShadow position={[0, h * 0.35, 0]}>
            <cylinderGeometry args={[r, r * 0.96, h * 0.7, 40]} />
            <meshStandardMaterial color={c} roughness={0.4} metalness={0.2} />
          </mesh>
          {/* LiDAR 타워 */}
          <mesh castShadow position={[0, h * 0.85, 0]}>
            <cylinderGeometry args={[r * 0.28, r * 0.32, h * 0.35, 24]} />
            <meshStandardMaterial color="#2c2f34" roughness={0.3} metalness={0.5} />
          </mesh>
          {/* 범퍼 */}
          <mesh position={[0, h * 0.22, d / 2 - 6]}>
            <boxGeometry args={[w * 0.96, h * 0.4, 12]} />
            <meshStandardMaterial color={shade(c, -25)} roughness={0.6} />
          </mesh>
          {/* 버튼 */}
          <Cyl rTop={26} rBot={26} h={8} pos={[0, h * 0.72, -r * 0.4]} color="#b8bec4" />
        </group>
      )
    }
    case 'airPurifier': {
      const r = Math.min(w, d) / 2
      const bodyH = h * 0.86
      return (
        <group>
          {/* 본체 타워 */}
          <mesh castShadow receiveShadow position={[0, bodyH / 2, 0]}>
            <cylinderGeometry args={[r, r * 1.04, bodyH, 40]} />
            <meshStandardMaterial color={c} roughness={0.5} />
          </mesh>
          {/* 상부 그릴 */}
          <mesh position={[0, bodyH + 4, 0]}>
            <cylinderGeometry args={[r * 0.92, r, h * 0.06, 40]} />
            <meshStandardMaterial color={shade(c, -35)} roughness={0.7} />
          </mesh>
          {/* 전면 에어가드 */}
          <mesh position={[0, h * 0.62, d / 2 - 4]} rotation={[0.12, 0, 0]}>
            <boxGeometry args={[w * 0.8, h * 0.3, 10]} />
            <meshStandardMaterial color="#cfd6da" roughness={0.15} metalness={0.3} />
          </mesh>
          {/* 하부 흡기 그릴 라인 */}
          <mesh position={[0, h * 0.08, 0]}>
            <cylinderGeometry args={[r * 1.05, r * 1.05, h * 0.05, 40, 1, true]} />
            <meshStandardMaterial color={shade(c, -45)} roughness={0.8} side={THREE_DOUBLE_SIDE} />
          </mesh>
        </group>
      )
    }
    case 'tvOled': {
      // 슬림 패널 + 중앙 발판 스탠드 (스탠드 포함 전체 h)
      const panelH = h - 60
      return (
        <group>
          {/* 패널 (베젤) */}
          <Box size={[w, panelH, 46]} pos={[0, 60, 0]} color="#101216" rough={0.35} metal={0.4} />
          {/* 화면 */}
          <Box
            size={[w - 36, panelH - 36, 6]}
            pos={[0, 78, 22]}
            color="#131c26"
            rough={0.08}
            metal={0.7}
          />
          {/* 중앙 발판 스탠드 */}
          <Box
            size={[Math.min(w * 0.33, 470), 26, d]}
            pos={[0, 0, 0]}
            color="#1c1f24"
            rough={0.4}
            metal={0.5}
          />
          <Box size={[60, 60, d * 0.7]} pos={[0, 26, 0]} color="#1c1f24" />
        </group>
      )
    }
    case 'curtain': {
      // 주름 커튼: 좌우 물결 패널 + 상단 레일
      const folds = Math.max(6, Math.round(w / 220))
      const foldW = w / folds
      const panels: ReactNode[] = []
      for (let i = 0; i < folds; i++) {
        panels.push(
          <Box
            key={i}
            size={[foldW * 0.62, h - 60, d]}
            pos={[-w / 2 + foldW * (i + 0.5), 60, 0]}
            color={i % 2 ? shade(c, -14) : shade(c, 10)}
            rough={0.95}
          />
        )
      }
      return (
        <group>
          {panels}
          <Box
            size={[w + 60, 50, d + 30]}
            pos={[0, h - 50, 0]}
            color="#8a8f96"
            rough={0.4}
            metal={0.5}
          />
        </group>
      )
    }
    case 'blind': {
      // 롤스크린: 상단 롤 + 하강 패널 + 하단 바
      return (
        <group>
          <Cyl
            rTop={d / 2 + 15}
            rBot={d / 2 + 15}
            h={w}
            pos={[0, h - 60, 0]}
            color={shade(c, -12)}
            rotZ={Math.PI / 2}
          />
          <Box size={[w - 40, h - 140, 16]} pos={[0, 40, 0]} color={c} rough={0.85} />
          <Box size={[w - 30, 40, d]} pos={[0, 20, 0]} color={shade(c, -30)} rough={0.6} />
        </group>
      )
    }
    default:
      return <Box size={[w, h, d]} pos={[0, 0, 0]} color={c} />
  }
}

import * as THREE from 'three'
const THREE_DOUBLE_SIDE = THREE.DoubleSide

function shade(hex: string | undefined, amt: number): string {
  if (!hex || !hex.startsWith('#')) return hex ?? '#cccccc'
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt))
  const b = Math.max(0, Math.min(255, (n & 255) + amt))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
