import {
  buildPlanFromImage,
  rescalePlanToWidth,
  vectorizeOpeningMask,
  type Gray,
  type PlanVisionOpts,
  type RawPlan,
} from '../domain/engine/planVision'
import { getPlanWidthMm } from '../domain/engine/planReview'
import { selectRaster2SeqRooms } from '../domain/engine/raster2seqRooms'
import type { PlanVisionGateway, RoomPredictionResult, SemanticFloorPlanMasks } from './ports'
import { ExternalServiceError } from './ports'

export interface FloorPlanPreviewInput {
  imageDataUrl: string
  classicGray: Gray
  classicOptions: PlanVisionOpts
  segmentedOptions: PlanVisionOpts
  useSegmentation: boolean
  useRoomPrediction: boolean
  knownWidthMm: number
  darkBackground: boolean
}

export interface FloorPlanPreviewResult {
  plan: RawPlan
  gray: Gray
  rawDetectedWidthMm: number
  sourceLabel: string
  roomSourceLabel: string
  usedSegmentation: boolean
  segmentationEngine?: string
  roomPredictionEngine?: string
}

export interface CreateFloorPlanPreview {
  execute(input: FloorPlanPreviewInput): Promise<FloorPlanPreviewResult>
  clearCache(): void
}

function attachSemanticOpenings(raw: RawPlan, masks: SemanticFloorPlanMasks): RawPlan {
  const doors = vectorizeOpeningMask(masks.openings.door, raw.walls, raw.mmPerPx, 'door')
  const windows = vectorizeOpeningMask(masks.openings.window, raw.walls, raw.mmPerPx, 'window')
  return {
    ...raw,
    openings: [...(doors.length ? doors : raw.openings), ...windows],
  }
}

export function createFloorPlanPreview(gateway: PlanVisionGateway): CreateFloorPlanPreview {
  const segmentationCache = new Map<string, Promise<SemanticFloorPlanMasks>>()
  const roomCache = new Map<string, Promise<RoomPredictionResult>>()
  const segmentation = (image: string) => {
    const cached = segmentationCache.get(image)
    if (cached) return cached
    const request = gateway.segment(image)
    segmentationCache.set(image, request)
    return request
  }
  const rooms = (image: string) => {
    const cached = roomCache.get(image)
    if (cached) return cached
    const request = gateway.rooms(image)
    roomCache.set(image, request)
    return request
  }

  return {
    async execute(input) {
      let gray = input.classicGray
      let sourceLabel = input.darkBackground ? '고전 CV(어두운 배경 자동 반전)' : '고전 CV'
      let usedSegmentation = false
      let masks: SemanticFloorPlanMasks | undefined
      if (input.useSegmentation) {
        try {
          masks = await segmentation(input.imageDataUrl)
          gray = masks.walls
          usedSegmentation = true
          sourceLabel = `CNN(${masks.engineLabel}, ${masks.durationMs.toFixed(0)}ms)`
        } catch (error) {
          const detail =
            error instanceof ExternalServiceError
              ? `${error.kind}${error.detail ? `:${error.detail}` : ''}`
              : error instanceof Error
                ? error.message
                : 'unknown'
          sourceLabel = `CNN 실패(${detail}) → ${
            input.darkBackground ? '고전 CV(어두운 배경 자동 반전)' : '고전 CV'
          }`
        }
      }

      let plan = buildPlanFromImage(
        gray,
        usedSegmentation ? input.segmentedOptions : input.classicOptions
      )
      if (masks) plan = attachSemanticOpenings(plan, masks)
      const rawDetectedWidthMm = getPlanWidthMm(plan)
      if (input.knownWidthMm > 0) plan = rescalePlanToWidth(plan, input.knownWidthMm)

      let roomSourceLabel = '기존 하이브리드 방 경계'
      let roomPredictionEngine: string | undefined
      if (input.useRoomPrediction) {
        try {
          const prediction = await rooms(input.imageDataUrl)
          roomPredictionEngine = prediction.engineLabel
          const selected = selectRaster2SeqRooms(plan, prediction, {
            targetWidth: gray.width,
            targetHeight: gray.height,
          })
          plan = selected.plan
          roomSourceLabel = selected.usedRaster2Seq
            ? `Raster2Seq(${prediction.engineLabel}, ${prediction.durationMs.toFixed(0)}ms)`
            : `Raster2Seq 거부 → 기존 방(${selected.fallbackReason})`
        } catch {
          roomSourceLabel = 'Raster2Seq 실패 → 기존 방'
        }
      }

      return {
        plan,
        gray,
        rawDetectedWidthMm,
        sourceLabel,
        roomSourceLabel,
        usedSegmentation,
        segmentationEngine: masks?.engineLabel,
        roomPredictionEngine,
      }
    },
    clearCache() {
      segmentationCache.clear()
      roomCache.clear()
    },
  }
}
