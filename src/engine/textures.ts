// ─────────────────────────────────────────────────────────────
// 절차적 텍스처 생성 — 실규격(mm) 반복 매핑
// 캔버스 1장 = 재질 1타일(tileMm). UV가 mm 단위이므로 repeat=1/tileMm
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three'
import type { FinishMaterial } from '../data/materials'

const cache = new Map<string, THREE.Texture>()
const S = 256 // canvas px per tile

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  return [c, c.getContext('2d')!]
}

function noise(ctx: CanvasRenderingContext2D, alpha: number, n = 400) {
  for (let i = 0; i < n; i++) {
    const g = Math.floor(Math.random() * 60)
    ctx.fillStyle = `rgba(${g},${g},${g},${alpha})`
    ctx.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5)
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt))
  const b = Math.max(0, Math.min(255, (n & 255) + amt))
  return `rgb(${r},${g},${b})`
}

const generators: Record<
  FinishMaterial['tex'],
  (ctx: CanvasRenderingContext2D, base: string) => void
> = {
  vinyl600: (ctx, base) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    // 오크 그레인 세로 줄무늬
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = shade(base, -14 - Math.random() * 18)
      ctx.lineWidth = 0.6 + Math.random()
      const x = Math.random() * S
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.bezierCurveTo(x + 8, S * 0.3, x - 8, S * 0.6, x + 4, S)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, S - 2, S - 2)
    noise(ctx, 0.03)
  },
  wood: (ctx, base) => woodPlanks(ctx, base, 6),
  woodDark: (ctx, base) => woodPlanks(ctx, base, 6),
  tile: (ctx, base) => gridTile(ctx, base, 1),
  tileSmall: (ctx, base) => gridTile(ctx, base, 2),
  concrete: (ctx, base) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    noise(ctx, 0.06, 1400)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    for (let i = 0; i < 8; i++) {
      ctx.beginPath()
      ctx.arc(Math.random() * S, Math.random() * S, 20 + Math.random() * 50, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  wallpaperPlain: (ctx, base) => plain(ctx, base),
  wallpaperGray: (ctx, base) => plain(ctx, base),
  fabricWall: (ctx, base) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i < S; i += 4) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, S)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(S, i)
      ctx.stroke()
    }
    noise(ctx, 0.04)
  },
  woodSlat: (ctx, base) => {
    ctx.fillStyle = shade(base, -70)
    ctx.fillRect(0, 0, S, S)
    const slatW = S / 5
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = shade(base, i % 2 ? -8 : 6)
      ctx.fillRect(i * slatW + 2, 0, slatW - 6, S)
      for (let j = 0; j < 10; j++) {
        ctx.strokeStyle = shade(base, -20 - Math.random() * 15)
        ctx.beginPath()
        const y = Math.random() * S
        ctx.moveTo(i * slatW + 2, y)
        ctx.lineTo((i + 1) * slatW - 4, y + 2)
        ctx.stroke()
      }
    }
  },
  accent: (ctx, base) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    noise(ctx, 0.03, 200)
  },
}

function woodPlanks(ctx: CanvasRenderingContext2D, base: string, rows: number) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  const h = S / rows
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = shade(base, -10 + Math.random() * 20)
    ctx.fillRect(0, r * h + 1, S, h - 2)
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = shade(base, -25 - Math.random() * 20)
      ctx.lineWidth = 0.7
      const y = r * h + Math.random() * h
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(S * 0.3, y + 3, S * 0.6, y - 3, S, y + 1)
      ctx.stroke()
    }
    // 이음매 (엇갈림)
    const seam = ((r % 2) * 0.5 + Math.random() * 0.3) * S
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(seam, r * h)
    ctx.lineTo(seam, (r + 1) * h)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'
  ctx.lineWidth = 1.4
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath()
    ctx.moveTo(0, r * h)
    ctx.lineTo(S, r * h)
    ctx.stroke()
  }
}

function gridTile(ctx: CanvasRenderingContext2D, base: string, cells: number) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  noise(ctx, 0.05, 900)
  ctx.strokeStyle = 'rgba(60,58,55,0.55)'
  ctx.lineWidth = 3
  const step = S / cells
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath()
    ctx.moveTo(i * step, 0)
    ctx.lineTo(i * step, S)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * step)
    ctx.lineTo(S, i * step)
    ctx.stroke()
  }
}

function plain(ctx: CanvasRenderingContext2D, base: string) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  for (let x = 0; x < S; x += S / 8) ctx.fillRect(x, 0, S / 16, S)
  noise(ctx, 0.02, 150)
}

/** 재질별 텍스처 (캐시). repeat는 호출부에서 mm 스케일에 맞춤 */
export function getTexture(mat: FinishMaterial): THREE.Texture {
  const hit = cache.get(mat.id)
  if (hit) return hit
  const [canvas, ctx] = makeCanvas()
  generators[mat.tex](ctx, mat.baseColor)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  cache.set(mat.id, tex)
  return tex
}

export function cloneWithRepeat(tex: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const t = tex.clone()
  t.needsUpdate = true
  t.repeat.set(rx, ry)
  return t
}
