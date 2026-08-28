// ─────────────────────────────────────────────────────────────
// CV 도면 자동 변환 모달 — 업로드 → 파라미터 슬라이더 → 실시간 오버레이 프리뷰 → FloorPlan 적용
// LLM 불필요. planVision 엔진 + normalizeAiPlan 검증 재사용.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  toGray,
  autoBinarizeFloorPlan,
  detectPlanRegions,
  buildPlanFromImage,
  autoThresholdOtsu,
  invertGray,
  inkRatio,
  rescalePlanToWidth,
  vectorizeOpeningMask,
  type Gray,
  type PlanVisionOpts,
  type RawPlan,
  type PlanRegion,
} from '../engine/planVision'
import { selectRaster2SeqRooms, type Raster2SeqResponse } from '../engine/raster2seqRooms'
import {
  assessScale,
  buildPlanReviewIssues,
  getPlanWidthMm,
  sanitizeOpeningCandidates,
} from '../engine/planReview'
import { normalizeAiPlan } from '../ai/normalizePlan'
import { useStore } from '../store/store'

const MAX_DIM = 1600 // 성능 가드: 긴 변 최대 px
const CV_SERVER_URL =
  (import.meta.env.VITE_CV_SERVER_URL as string | undefined)?.replace(/\/+$/, '') ??
  'http://127.0.0.1:8976'
const RASTER2SEQ_SERVER_URL =
  (import.meta.env.VITE_RASTER2SEQ_SERVER_URL as string | undefined)?.replace(/\/+$/, '') ??
  'http://127.0.0.1:8977'
const RASTER2SEQ_RESEARCH_ENABLED =
  import.meta.env.VITE_ENABLE_NONCOMMERCIAL_RESEARCH_MODE === 'true'
const CUBICASA_RESEARCH_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_NONCOMMERCIAL_RESEARCH_MODE === 'true'
const RASTER2SEQ_DEFAULT =
  RASTER2SEQ_RESEARCH_ENABLED && import.meta.env.VITE_ROOM_POLYGON_ENGINE === 'raster2seq'

interface NeuralMaskResponse {
  maskDataUrl: string
  doorMaskDataUrl: string
  windowMaskDataUrl: string
  width: number
  height: number
  device: 'cuda' | 'cpu'
  inferenceMs: number
  error?: string
}

interface AppliedSummary {
  walls: number
  rooms: number
  openings: number
  elapsedSeconds: number
}

export function PlanVisionModal({ onClose }: { onClose: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [srcUrl, setSrcUrl] = useState('')
  const [status, setStatus] = useState('')
  const [threshold, setThreshold] = useState(128)
  const [minThickness, setMinThickness] = useState(4)
  const [minLength, setMinLength] = useState(40)
  const [exteriorMm, setExteriorMm] = useState(200)
  const [knownWidthMm, setKnownWidthMm] = useState(0)
  const [acceptEstimatedScale, setAcceptEstimatedScale] = useState(false)
  const [useOtsu, setUseOtsu] = useState(true)
  const [useNeural, setUseNeural] = useState(false)
  const [neuralDevice, setNeuralDevice] = useState<string | null>(null)
  const [useRaster2Seq, setUseRaster2Seq] = useState(RASTER2SEQ_DEFAULT)
  const [raster2SeqDevice, setRaster2SeqDevice] = useState<string | null>(null)
  const [previewReady, setPreviewReady] = useState(false)
  const [previewPlan, setPreviewPlan] = useState<RawPlan | null>(null)
  const [detectedWidthMm, setDetectedWidthMm] = useState(0)
  const [inputRegions, setInputRegions] = useState<PlanRegion[]>([])
  const [appliedSummary, setAppliedSummary] = useState<AppliedSummary | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const grayRef = useRef<Gray | null>(null)
  const neuralGrayRef = useRef<Gray | null>(null)
  const neuralOpeningMasksRef = useRef<{ door: Gray; window: Gray } | null>(null)
  const neuralCacheGenerationRef = useRef(-1)
  const neuralRequestControllerRef = useRef<AbortController | null>(null)
  const raster2SeqRequestControllerRef = useRef<AbortController | null>(null)
  const usingNeuralRef = useRef(false)
  const darkBackgroundRef = useRef(false)
  const previewPlanRef = useRef<RawPlan | null>(null)
  const imageGenerationRef = useRef(0)
  const runGenerationRef = useRef(0)
  const raster2SeqCacheRef = useRef<{
    generation: number
    promise?: Promise<Raster2SeqResponse>
    response?: Raster2SeqResponse
  } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const conversionStartedAtRef = useRef(0)

  const scaleAssessment = useMemo(
    () => assessScale({ detectedWidthMm, knownWidthMm, acceptEstimatedScale }),
    [acceptEstimatedScale, detectedWidthMm, knownWidthMm]
  )
  const reviewIssues = useMemo(
    () => (previewPlan ? buildPlanReviewIssues(previewPlan, scaleAssessment) : []),
    [previewPlan, scaleAssessment]
  )
  const blockerCount = reviewIssues.filter((issue) => issue.severity === 'blocker').length

  useEffect(() => {
    if (!CUBICASA_RESEARCH_ENABLED) {
      setNeuralDevice(null)
      setUseNeural(false)
      return
    }
    const controller = new AbortController()
    fetch(`${CV_SERVER_URL}/health`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('offline'))))
      .then((health: { device?: string }) => {
        if (controller.signal.aborted) return
        setNeuralDevice(health.device ?? 'unknown')
        setUseNeural(true)
        setMinThickness(2)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setNeuralDevice(null)
        setUseNeural(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!RASTER2SEQ_RESEARCH_ENABLED) {
      setRaster2SeqDevice(null)
      setUseRaster2Seq(false)
      return
    }
    const controller = new AbortController()
    fetch(`${RASTER2SEQ_SERVER_URL}/health`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('offline'))))
      .then((health: { device?: string }) => {
        if (controller.signal.aborted) return
        setRaster2SeqDevice(health.device ?? 'unknown')
        setUseRaster2Seq(RASTER2SEQ_DEFAULT)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setRaster2SeqDevice(null)
        setUseRaster2Seq(false)
      })
    return () => controller.abort()
  }, [])

  const loadFile = (f: File) => {
    const url = URL.createObjectURL(f)
    setSrcUrl(url)
    const generation = imageGenerationRef.current + 1
    imageGenerationRef.current = generation
    runGenerationRef.current += 1
    neuralRequestControllerRef.current?.abort()
    raster2SeqRequestControllerRef.current?.abort()
    raster2SeqCacheRef.current = null
    previewPlanRef.current = null
    setPreviewPlan(null)
    setPreviewReady(false)
    setDetectedWidthMm(0)
    setInputRegions([])
    setKnownWidthMm(0)
    setAcceptEstimatedScale(false)
    setAppliedSummary(null)
    conversionStartedAtRef.current = performance.now()
    neuralGrayRef.current = null
    neuralOpeningMasksRef.current = null
    neuralCacheGenerationRef.current = -1
    darkBackgroundRef.current = false
    const im = new Image()
    im.onload = () => {
      if (generation !== imageGenerationRef.current) {
        URL.revokeObjectURL(url)
        return
      }
      const scale = Math.min(1, MAX_DIM / Math.max(im.naturalWidth, im.naturalHeight))
      im.width = Math.round(im.naturalWidth * scale)
      im.height = Math.round(im.naturalHeight * scale)
      setImg(im)
      setStatus(`이미지 로드: ${im.naturalWidth}×${im.naturalHeight}px`)
    }
    im.src = url
  }

  /** 이미지 → Gray (캔버스 경유) */
  const rgbaRef = useRef<ImageData | null>(null)
  const computeGray = useCallback((im: HTMLImageElement, th: number): Gray | null => {
    const c = document.createElement('canvas')
    c.width = im.width
    c.height = im.height
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(im, 0, 0, c.width, c.height)
    const id = ctx.getImageData(0, 0, c.width, c.height)
    rgbaRef.current = id
    const automatic = autoBinarizeFloorPlan(id.data, c.width, c.height)
    if (automatic.polarity === 'light-on-dark') {
      darkBackgroundRef.current = true
      return automatic.gray
    }
    darkBackgroundRef.current = false
    const g0 = toGray(id.data, c.width, c.height, th)
    // 어두운 배경(반전 도면) 자동 감지 → 반전
    return inkRatio(g0) > 0.5 ? invertGray(g0) : g0
  }, [])

  const imageDataUrl = useCallback((im: HTMLImageElement): string => {
    const canvas = document.createElement('canvas')
    canvas.width = im.width
    canvas.height = im.height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(im, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }, [])

  const decodeNeuralMask = useCallback(async (dataUrl: string): Promise<Gray> => {
    const mask = new Image()
    mask.src = dataUrl
    await mask.decode()
    const canvas = document.createElement('canvas')
    canvas.width = mask.naturalWidth
    canvas.height = mask.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(mask, 0, 0)
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const data = new Uint8Array(canvas.width * canvas.height)
    for (let index = 0, pixel = 0; index < data.length; index++, pixel += 4) {
      if (rgba[pixel] >= 128) data[index] = 255
    }
    return { data, width: canvas.width, height: canvas.height }
  }, [])

  const getNeuralGray = useCallback(
    async (
      im: HTMLImageElement
    ): Promise<{ gray: Gray; openings: { door: Gray; window: Gray }; label: string }> => {
      const generation = imageGenerationRef.current
      if (
        neuralCacheGenerationRef.current === generation &&
        neuralGrayRef.current &&
        neuralOpeningMasksRef.current
      ) {
        return {
          gray: neuralGrayRef.current,
          openings: neuralOpeningMasksRef.current,
          label: `CNN(${neuralDevice ?? 'auto'}) 캐시`,
        }
      }
      neuralRequestControllerRef.current?.abort()
      const controller = new AbortController()
      neuralRequestControllerRef.current = controller
      const timeout = setTimeout(() => controller.abort(), 60_000)
      try {
        const response = await fetch(`${CV_SERVER_URL}/segment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageDataUrl: imageDataUrl(im) }),
          signal: controller.signal,
        })
        const result = (await response.json()) as NeuralMaskResponse
        if (!response.ok || result.error) throw new Error(result.error ?? `HTTP ${response.status}`)
        const gray = await decodeNeuralMask(result.maskDataUrl)
        const openings = {
          door: await decodeNeuralMask(result.doorMaskDataUrl),
          window: await decodeNeuralMask(result.windowMaskDataUrl),
        }
        if (generation !== imageGenerationRef.current) throw new Error('stale-image-response')
        neuralGrayRef.current = gray
        neuralOpeningMasksRef.current = openings
        neuralCacheGenerationRef.current = generation
        setNeuralDevice(result.device)
        return {
          gray,
          openings,
          label: `CNN(${result.device}, ${result.inferenceMs.toFixed(0)}ms)`,
        }
      } finally {
        clearTimeout(timeout)
        if (neuralRequestControllerRef.current === controller) {
          neuralRequestControllerRef.current = null
        }
      }
    },
    [decodeNeuralMask, imageDataUrl, neuralDevice]
  )

  const getRaster2SeqRooms = useCallback(
    async (im: HTMLImageElement): Promise<Raster2SeqResponse> => {
      const generation = imageGenerationRef.current
      const cached = raster2SeqCacheRef.current
      if (cached?.generation === generation) {
        if (cached.response) return cached.response
        if (cached.promise) return cached.promise
      }

      raster2SeqRequestControllerRef.current?.abort()
      const controller = new AbortController()
      raster2SeqRequestControllerRef.current = controller
      const promise = (async () => {
        const timeout = setTimeout(() => controller.abort(), 60_000)
        try {
          const response = await fetch(`${RASTER2SEQ_SERVER_URL}/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageDataUrl: imageDataUrl(im) }),
            signal: controller.signal,
          })
          const result = (await response.json()) as Raster2SeqResponse
          if (!response.ok || result.error) {
            throw new Error(result.error ?? `HTTP ${response.status}`)
          }
          if (generation !== imageGenerationRef.current) throw new Error('stale-image-response')
          raster2SeqCacheRef.current = { generation, response: result }
          return result
        } finally {
          clearTimeout(timeout)
          if (raster2SeqRequestControllerRef.current === controller) {
            raster2SeqRequestControllerRef.current = null
          }
        }
      })()
      raster2SeqCacheRef.current = { generation, promise }
      try {
        return await promise
      } catch (error) {
        if (raster2SeqCacheRef.current?.generation === generation) {
          raster2SeqCacheRef.current = null
        }
        throw error
      }
    },
    [imageDataUrl]
  )

  const visionOptions = useCallback(
    (th: number, neural: boolean): PlanVisionOpts => ({
      threshold: th,
      morphCloseRadius: neural ? 1 : 2,
      denoiseMinComponentPx: neural ? 0 : 300,
      orthoToleranceMm: 80,
      minThicknessPx: neural ? 2 : minThickness,
      minLengthPx: neural ? 40 : minLength,
      gapRangeMm: [500, 1400],
      exteriorWallMm: exteriorMm,
      minRoomAreaM2: 1.5,
      wallHeightMm: 2400,
    }),
    [exteriorMm, minLength, minThickness]
  )

  const attachNeuralOpenings = useCallback((raw: ReturnType<typeof buildPlanFromImage>) => {
    const masks = neuralOpeningMasksRef.current
    if (!masks) return raw
    const doors = vectorizeOpeningMask(masks.door, raw.walls, raw.mmPerPx, 'door')
    const windows = vectorizeOpeningMask(masks.window, raw.walls, raw.mmPerPx, 'window')
    return {
      ...raw,
      openings: [...(doors.length ? doors : raw.openings), ...windows],
    }
  }, [])

  /** 파이프라인 실행 + 프리뷰 렌더 */
  const run = useCallback(async () => {
    if (!img || !canvasRef.current) return
    const runGeneration = ++runGenerationRef.current
    previewPlanRef.current = null
    setPreviewPlan(null)
    setPreviewReady(false)
    let th = threshold
    if (useOtsu) {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      th = autoThresholdOtsu(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
    }
    const inputGray = computeGray(img, th)
    if (!inputGray) return
    const regions = detectPlanRegions(inputGray)
    if (runGeneration !== runGenerationRef.current) return
    setInputRegions(regions)
    if (regions.length > 1) {
      grayRef.current = inputGray
      usingNeuralRef.current = false
      setDetectedWidthMm(0)
      const cv = canvasRef.current
      cv.width = inputGray.width
      cv.height = inputGray.height
      const ctx = cv.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.drawImage(img, 0, 0, cv.width, cv.height)
      ctx.strokeStyle = '#ff9f1a'
      ctx.fillStyle = '#ff9f1a'
      ctx.lineWidth = Math.max(2, Math.round(Math.min(cv.width, cv.height) * 0.004))
      ctx.setLineDash([10, 6])
      ctx.font = `${Math.max(12, Math.round(Math.min(cv.width, cv.height) * 0.025))}px sans-serif`
      regions.forEach((region, index) => {
        ctx.strokeRect(region.x, region.y, region.width, region.height)
        ctx.fillText(`영역 ${index + 1}`, region.x + 6, Math.max(16, region.y + 18))
      })
      ctx.setLineDash([])
      setStatus(`여러 평면도 영역 ${regions.length}개 감지 · 원하는 영역만 잘라 다시 업로드하세요.`)
      return
    }

    let gray: Gray | null = inputGray
    let sourceLabel = '고전 CV'
    let neural = false
    if (useNeural) {
      setStatus('로컬 CNN 벽 분할 중…')
      try {
        const result = await getNeuralGray(img)
        gray = result.gray
        sourceLabel = result.label
        neural = true
      } catch (error) {
        sourceLabel = 'CNN 실패 → 고전 CV'
        console.warn('[PlanVision] 로컬 CNN 폴백', error)
      }
    }
    if (!neural && darkBackgroundRef.current) sourceLabel = '고전 CV(어두운 배경 자동 반전)'
    grayRef.current = gray
    usingNeuralRef.current = neural
    const opts = visionOptions(th, neural)
    let raw: RawPlan
    let rawDetectedWidthMm: number
    let roomSourceLabel = '기존 하이브리드 방 경계'
    try {
      raw = buildPlanFromImage(gray, opts)
      if (neural) raw = attachNeuralOpenings(raw)
      rawDetectedWidthMm = getPlanWidthMm(raw)
      if (knownWidthMm > 0) raw = rescalePlanToWidth(raw, knownWidthMm)
      if (useRaster2Seq) {
        setStatus('Raster2Seq 방 폴리곤 추론·검증 중…')
        try {
          const response = await getRaster2SeqRooms(img)
          if (runGeneration !== runGenerationRef.current) return
          setRaster2SeqDevice(response.device ?? raster2SeqDevice)
          const selected = selectRaster2SeqRooms(raw, response, {
            targetWidth: gray.width,
            targetHeight: gray.height,
          })
          raw = selected.plan
          roomSourceLabel = selected.usedRaster2Seq
            ? `Raster2Seq(${response.device ?? 'auto'}, ${(response.inferenceMs ?? 0).toFixed(0)}ms)`
            : `Raster2Seq 거부 → 기존 방(${selected.fallbackReason})`
        } catch (error) {
          if (runGeneration !== runGenerationRef.current) return
          roomSourceLabel = 'Raster2Seq 실패 → 기존 방'
          console.warn('[PlanVision] Raster2Seq 폴백', error)
        }
      }
    } catch (e) {
      setStatus(`실패: ${(e as Error).message}`)
      return
    }
    if (runGeneration !== runGenerationRef.current) return
    previewPlanRef.current = raw
    setPreviewPlan(raw)
    setDetectedWidthMm(rawDetectedWidthMm)
    setPreviewReady(true)
    // 프리뷰 렌더
    const cv = canvasRef.current
    cv.width = gray.width
    cv.height = gray.height
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, cv.width, cv.height)
    // 방 반투명 채움
    const colors = ['#4a90c233', '#59d49933', '#ffb3002b', '#c26eb233', '#e0555533']
    raw.rooms.forEach((r, i) => {
      ctx.fillStyle = colors[i % colors.length]
      ctx.beginPath()
      r.polygon.forEach((p, k) =>
        k === 0
          ? ctx.moveTo(p.x / raw.mmPerPx, p.y / raw.mmPerPx)
          : ctx.lineTo(p.x / raw.mmPerPx, p.y / raw.mmPerPx)
      )
      ctx.closePath()
      ctx.fill()
    })
    // 벽 (빨강, 두께 반영)
    ctx.strokeStyle = '#e04040'
    for (const w of raw.walls) {
      ctx.lineWidth = Math.max(2, w.thickness / raw.mmPerPx)
      ctx.beginPath()
      ctx.moveTo(w.a.x / raw.mmPerPx, w.a.y / raw.mmPerPx)
      ctx.lineTo(w.b.x / raw.mmPerPx, w.b.y / raw.mmPerPx)
      ctx.stroke()
    }
    // 문 (파랑)
    ctx.strokeStyle = '#2b6fd8'
    ctx.lineWidth = 3
    for (const o of raw.openings) {
      const half = o.width / raw.mmPerPx / 2
      ctx.beginPath()
      ctx.moveTo(o.at.x / raw.mmPerPx - half, o.at.y / raw.mmPerPx - 6)
      ctx.lineTo(o.at.x / raw.mmPerPx + half, o.at.y / raw.mmPerPx - 6)
      ctx.stroke()
    }
    setStatus(
      `${sourceLabel} · ${roomSourceLabel} · 벽 ${raw.walls.length}개 · 방 ${raw.rooms.length}개 · 문 ${raw.openings.filter((opening) => opening.type === 'door').length}개 · 창 ${raw.openings.filter((opening) => opening.type === 'window').length}개 · 축척 1px=${raw.mmPerPx.toFixed(1)}mm`
    )
  }, [
    img,
    threshold,
    knownWidthMm,
    useOtsu,
    useNeural,
    computeGray,
    getNeuralGray,
    getRaster2SeqRooms,
    visionOptions,
    attachNeuralOpenings,
    useRaster2Seq,
    raster2SeqDevice,
  ])

  // 파라미터 변경 시 디바운스 재실행
  useEffect(() => {
    if (!img) return
    runGenerationRef.current += 1
    previewPlanRef.current = null
    setPreviewPlan(null)
    setPreviewReady(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void run(), 250)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [img, threshold, minThickness, minLength, exteriorMm, knownWidthMm, run])

  function apply() {
    if (!img || !previewPlanRef.current) return
    if (inputRegions.length > 1 || !scaleAssessment.canApply || blockerCount > 0) {
      useStore.getState().showToast('축척과 필수 검출 항목을 확인한 뒤 적용하세요.', 'error')
      return
    }
    try {
      const raw = previewPlanRef.current
      // 문 갭 mm 필터 (normalize 전 적용 — 이후 인덱스 대응으로 offset 재계산)
      const keptOpenings = sanitizeOpeningCandidates(raw.openings)
      const openingWalls = keptOpenings.map((opening) => {
        let bestIndex = 0
        let bestDistance = Infinity
        raw.walls.forEach((wall, index) => {
          const dx = wall.b.x - wall.a.x
          const dy = wall.b.y - wall.a.y
          const length2 = dx * dx + dy * dy || 1
          const t = Math.max(
            0,
            Math.min(1, ((opening.at.x - wall.a.x) * dx + (opening.at.y - wall.a.y) * dy) / length2)
          )
          const distance = Math.hypot(
            opening.at.x - (wall.a.x + dx * t),
            opening.at.y - (wall.a.y + dy * t)
          )
          if (distance < bestDistance) {
            bestDistance = distance
            bestIndex = index
          }
        })
        return `w${bestIndex + 1}`
      })
      const norm = normalizeAiPlan({
        wallHeight: raw.wallHeight,
        walls: raw.walls,
        openings: keptOpenings.map((o, index) => ({
          wallId: openingWalls[index],
          type: o.type,
          offset: 0,
          width: o.width,
          height: o.type === 'window' ? 1500 : 2000,
          sill: o.type === 'window' ? 900 : 0,
        })),
        rooms: raw.rooms,
      })
      if (!norm.ok || !norm.plan) {
        useStore.getState().showToast(`도면 변환 실패: ${norm.error}`, 'error')
        return
      }
      // opening offset 재계산 (벽 시작점부터의 거리) — keptOpenings[i] ↔ norm.openings[i] 순서 대응
      const st = useStore.getState()
      const nplan = norm.plan
      nplan.openings.forEach((o, i) => {
        const w = nplan.walls.find((x) => x.id === o.wallId)
        if (!w) return
        const at = keptOpenings[i].at
        const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1
        const t =
          ((at.x - w.a.x) * (w.b.x - w.a.x) + (at.y - w.a.y) * (w.b.y - w.a.y)) / (len * len)
        o.offset = Math.max(0, Math.min(len - o.width, t * len))
      })
      st.loadProject({
        version: 1,
        name: 'CV 도면 변환',
        plan: nplan,
        placements: [],
        customProducts: st.customProducts,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      st.setMode('2d')
      setAppliedSummary({
        walls: nplan.walls.length,
        rooms: nplan.rooms.length,
        openings: nplan.openings.length,
        elapsedSeconds: Math.max(
          1,
          Math.round((performance.now() - conversionStartedAtRef.current) / 1000)
        ),
      })
      setStatus('변환 적용 완료')
    } catch (e) {
      console.error('[PlanVision] apply 실패', e)
      useStore.getState().showToast(`도면 변환 실패: ${(e as Error).message}`, 'error')
      setStatus(`적용 실패: ${(e as Error).message}`)
    }
  }

  function finish(mode: '2d' | '3d') {
    useStore.getState().setMode(mode)
    onClose()
  }

  if (appliedSummary) {
    return (
      <div className="modal-bg" onClick={onClose}>
        <div className="modal pv-complete" onClick={(event) => event.stopPropagation()}>
          <div className="pv-complete-mark">✓</div>
          <p className="pv-kicker">평면도 변환</p>
          <h3>변환 적용 완료</h3>
          <p className="pv-complete-copy">
            벽 {appliedSummary.walls}개 · 방 {appliedSummary.rooms}개 · 문·창문{' '}
            {appliedSummary.openings}개를 {appliedSummary.elapsedSeconds}초 만에 만들었습니다.
          </p>
          <p className="pv-review-note">
            자동 변환은 초안입니다. 가구를 배치하기 전에 2D에서 벽 연결, 방 경계, 문·창문과 실측
            치수를 확인하세요.
          </p>
          <div className="pv-complete-actions">
            <button className="primary" onClick={() => finish('2d')}>
              2D에서 보정 <small>권장</small>
            </button>
            <button onClick={() => finish('3d')}>바로 3D 보기</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="pv-hero">
          <p className="pv-kicker">평면도 → 편집 가능한 공간</p>
          <h3>평면도 업로드 → 3D</h3>
          <p className="hint">
            이미지를 올리고 실측 가로를 확인하면 벽·방·문을 추출합니다. 결과 적용 후 2D 보정 또는 3D
            확인을 선택할 수 있습니다.
          </p>
        </div>

        {!CUBICASA_RESEARCH_ENABLED && (
          <div className="pv-deploy-safe" role="status">
            <b>상업 배포 안전 모드</b>
            <span>비상업 CNN 모델은 비활성 상태이며, 상업 사용 가능한 고전 CV만 사용합니다.</span>
          </div>
        )}

        <ol className="pv-steps" aria-label="평면도 변환 단계">
          <li className={img ? 'done' : 'active'}>1. 도면 업로드</li>
          <li
            className={
              img && !scaleAssessment.canApply ? 'active' : scaleAssessment.canApply ? 'done' : ''
            }
          >
            2. 축척 확인
          </li>
          <li className={previewReady && scaleAssessment.canApply ? 'active' : ''}>3. 검출 검토</li>
        </ol>

        <section className="pv-stage">
          <div className="pv-stage-head">
            <span>1</span>
            <div>
              <b>도면 이미지</b>
              <small>PNG·JPG, 긴 변 최대 1600px로 안전하게 처리</small>
            </div>
          </div>
          <label className="pv-upload">
            <input
              type="file"
              accept="image/*"
              aria-label="평면도 이미지 업로드"
              onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
            />
            <strong>{img ? '다른 도면 선택' : '평면도 이미지 선택'}</strong>
            <span>
              {img
                ? `${img.naturalWidth}×${img.naturalHeight}px 불러옴`
                : '파일을 선택해 검출을 시작합니다'}
            </span>
          </label>
        </section>

        {img && (
          <>
            {inputRegions.length > 1 && (
              <div className="pv-input-blocker" role="alert">
                <b>여러 평면도 영역이 감지되었습니다.</b>
                <span>
                  현재는 한 번에 한 층 또는 한 세대만 변환할 수 있습니다. 원하는 영역만 잘라 다시
                  업로드하세요.
                </span>
              </div>
            )}
            <section className="pv-stage pv-scale-stage">
              <div className="pv-stage-head">
                <span>2</span>
                <div>
                  <b>축척 확인</b>
                  <small>정확한 가구 배치를 위해 도면에 적힌 전체 가로 치수를 입력하세요.</small>
                </div>
              </div>
              <div className="pv-scale-grid">
                <label>
                  도면 전체 가로 실측(mm)
                  <input
                    type="number"
                    min={1000}
                    step={100}
                    value={knownWidthMm || ''}
                    placeholder="예: 11800"
                    aria-label="도면 전체 가로 실측"
                    onChange={(e) => setKnownWidthMm(Math.max(0, Number(e.target.value) || 0))}
                  />
                </label>
                <div className={`pv-scale-state ${scaleAssessment.mode}`} aria-live="polite">
                  <b>
                    {scaleAssessment.mode === 'calibrated'
                      ? '실측 축척 사용'
                      : scaleAssessment.mode === 'estimated'
                        ? '추정 축척 사용'
                        : '축척 확인 필요'}
                  </b>
                  <span>{scaleAssessment.message}</span>
                </div>
              </div>
              {!knownWidthMm && (
                <label className="pv-estimated-confirm">
                  <input
                    type="checkbox"
                    checked={acceptEstimatedScale}
                    onChange={(event) => setAcceptEstimatedScale(event.target.checked)}
                  />
                  실측값 없이 추정 축척을 사용하고, 2D에서 치수를 직접 검수하겠습니다.
                </label>
              )}
            </section>

            <details className="pv-advanced">
              <summary>고급 검출 설정</summary>
              <div className="pv-research-note">
                <b>모델 사용 범위</b>
                <span>
                  CubiCasa 계열 CNN·Raster2Seq는 비상업 연구 전용입니다. production 빌드에서는
                  명시적 연구 모드 없이는 비활성화됩니다.
                </span>
              </div>
              <label className="pv-neural-toggle">
                <input
                  type="checkbox"
                  checked={useNeural}
                  disabled={!CUBICASA_RESEARCH_ENABLED || !neuralDevice}
                  onChange={(event) => {
                    setUseNeural(event.target.checked)
                    if (event.target.checked) setMinThickness(2)
                  }}
                />
                로컬 CNN 벽 분할{' '}
                {!CUBICASA_RESEARCH_ENABLED
                  ? '(배포 비활성)'
                  : neuralDevice
                    ? `(${neuralDevice.toUpperCase()}, 연구 전용)`
                    : '(서버 미실행)'}
              </label>
              <label className="pv-neural-toggle">
                <input
                  type="checkbox"
                  checked={useRaster2Seq}
                  disabled={!RASTER2SEQ_RESEARCH_ENABLED || !raster2SeqDevice}
                  onChange={(event) => setUseRaster2Seq(event.target.checked)}
                />
                실험실 Raster2Seq 방 경계{' '}
                {!RASTER2SEQ_RESEARCH_ENABLED
                  ? '(비상업 연구 모드 비활성)'
                  : raster2SeqDevice
                    ? `(${raster2SeqDevice.toUpperCase()})`
                    : '(서버 미실행)'}
              </label>

              <div className="pv-controls">
                <label>
                  이진화 임계값 {threshold}
                  <input
                    type="range"
                    min={60}
                    max={220}
                    value={threshold}
                    onChange={(e) => setThreshold(+e.target.value)}
                  />
                </label>
                <label>
                  최소 벽 두께 {minThickness}px
                  <input
                    type="range"
                    min={2}
                    max={20}
                    value={minThickness}
                    onChange={(e) => setMinThickness(+e.target.value)}
                  />
                </label>
                <label>
                  최소 벽 길이 {minLength}px
                  <input
                    type="range"
                    min={20}
                    max={200}
                    value={minLength}
                    onChange={(e) => setMinLength(+e.target.value)}
                  />
                </label>
                <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={useOtsu}
                    onChange={(e) => setUseOtsu(e.target.checked)}
                  />{' '}
                  자동 임계값(Otsu)
                </label>
                <label>
                  외벽 두께(축척 기준) {exteriorMm}mm
                  <input
                    type="range"
                    min={100}
                    max={400}
                    step={10}
                    value={exteriorMm}
                    onChange={(e) => setExteriorMm(+e.target.value)}
                  />
                </label>
              </div>
            </details>

            <section className="pv-stage pv-review-stage">
              <div className="pv-stage-head">
                <span>3</span>
                <div>
                  <b>검출 결과 검토</b>
                  <small>빨강 벽, 색 채움 방, 파랑 문을 원본과 비교하세요.</small>
                </div>
              </div>

              {/* 좌: 원본 도면 / 우: 변환 결과 오버레이 */}
              <div className="pv-split">
                <div className="pv-pane">
                  <div className="pv-pane-title">원본 도면</div>
                  <img src={srcUrl} alt="원본 도면" />
                </div>
                <div className="pv-pane">
                  <div className="pv-pane-title">변환 결과 · 벽 빨강 / 방 채움 / 문 파랑</div>
                  <div className="pv-preview">
                    <canvas ref={canvasRef} style={{ maxWidth: '100%', background: '#fff' }} />
                  </div>
                </div>
              </div>

              {previewReady && (
                <div className="pv-review-result" aria-live="polite">
                  {reviewIssues.length === 0 ? (
                    <p className="pv-review-clear">
                      기본 검사를 통과했습니다. 원본과 세부 위치를 비교하세요.
                    </p>
                  ) : (
                    <ul className="pv-issues">
                      {reviewIssues.map((issue) => (
                        <li key={issue.id} className={issue.severity}>
                          <b>{issue.severity === 'blocker' ? '적용 전 확인' : '검토 필요'}</b>
                          <span>{issue.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        <div className="pv-actions">
          <button
            className="primary"
            disabled={
              !img ||
              !previewReady ||
              inputRegions.length > 1 ||
              !scaleAssessment.canApply ||
              blockerCount > 0
            }
            onClick={apply}
          >
            변환 결과 적용
          </button>
          <button onClick={onClose}>닫기</button>
        </div>
        {status && <p className="status">{status}</p>}
      </div>
    </div>
  )
}
