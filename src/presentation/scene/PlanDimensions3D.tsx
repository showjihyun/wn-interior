// ─────────────────────────────────────────────────────────────
// 3D 외곽 치수선 — 건축 도면 스타일 (연장선 + 끝눈금 + mm 숫자)
// 오늘의집/아키스케치 2D 치수 표기를 3D 상단 뷰 기준으로 재현
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import type { FloorPlan } from '../../domain/model'
import { getPlanBounds } from '../../domain/planBounds'

const BLUE = '#2b6fd8'
const EXT = '#8fa0b3'

function fmtMm(v: number): string {
  return `${Math.round(v).toLocaleString('ko-KR')}`
}

export function PlanDimensions3D({ plan }: { plan: FloorPlan }) {
  const dim = useMemo(() => {
    return getPlanBounds(plan)
  }, [plan])

  if (!dim) return null
  const { minX, minY, maxX, maxY } = dim
  const y = 30 // 바닥 위 살짝 띄움
  const off = 900 // 벽 외곽 → 치수선 거리
  const tick = 140 // 끝 눈금 길이
  const width = maxX - minX
  const depth = maxY - minY

  // 가로 치수선 (남측 바깥), 세로 치수선 (동측 바깥)
  const zH = maxY + off
  const xV = maxX + off

  return (
    <group>
      {/* ── 가로 (폭) ── */}
      <Line
        points={[
          [minX, y, zH],
          [maxX, y, zH],
        ]}
        color={BLUE}
        lineWidth={1.5}
      />
      <Line
        points={[
          [minX, y, zH - tick],
          [minX, y, zH + tick],
        ]}
        color={BLUE}
        lineWidth={1.5}
      />
      <Line
        points={[
          [maxX, y, zH - tick],
          [maxX, y, zH + tick],
        ]}
        color={BLUE}
        lineWidth={1.5}
      />
      {/* 연장선: 코너 → 치수선 */}
      <Line
        points={[
          [minX, y, maxY + 60],
          [minX, y, zH + tick],
        ]}
        color={EXT}
        lineWidth={1}
        dashed
        dashSize={80}
        gapSize={60}
      />
      <Line
        points={[
          [maxX, y, maxY + 60],
          [maxX, y, zH + tick],
        ]}
        color={EXT}
        lineWidth={1}
        dashed
        dashSize={80}
        gapSize={60}
      />
      <Html position={[minX + width / 2, y, zH + 10]} center zIndexRange={[9, 0]}>
        <div className="dim3d-label">{fmtMm(width)}</div>
      </Html>

      {/* ── 세로 (깊이) ── */}
      <Line
        points={[
          [xV, y, minY],
          [xV, y, maxY],
        ]}
        color={BLUE}
        lineWidth={1.5}
      />
      <Line
        points={[
          [xV - tick, y, minY],
          [xV + tick, y, minY],
        ]}
        color={BLUE}
        lineWidth={1.5}
      />
      <Line
        points={[
          [xV - tick, y, maxY],
          [xV + tick, y, maxY],
        ]}
        color={BLUE}
        lineWidth={1.5}
      />
      <Line
        points={[
          [maxX + 60, y, minY],
          [xV + tick, y, minY],
        ]}
        color={EXT}
        lineWidth={1}
        dashed
        dashSize={80}
        gapSize={60}
      />
      <Line
        points={[
          [maxX + 60, y, maxY],
          [xV + tick, y, maxY],
        ]}
        color={EXT}
        lineWidth={1}
        dashed
        dashSize={80}
        gapSize={60}
      />
      <Html position={[xV + 10, y, minY + depth / 2]} center zIndexRange={[9, 0]}>
        <div className="dim3d-label">{fmtMm(depth)}</div>
      </Html>
    </group>
  )
}

// THREE 참조 유지 (Line 내부용) — tree-shaking 방지 목적은 아니며 타입 참조용
export const _t = THREE
