import { describe, expect, it } from 'vitest'
import {
  assessMultiviewExperimentReadiness,
  compareMeshBenchmarkCandidates,
  selectMultiviewRegenerationCandidate,
} from './generatedMeshExperiment'

const target = { w: 2.28, d: 0.95, h: 0.83 }

describe('KIVIK 다중 시점 타당성 실험', () => {
  it('전체 제품 독립 시점이 2개뿐이고 GPU가 모델 최소 VRAM보다 작으면 실행을 차단한다', () => {
    const result = assessMultiviewExperimentReadiness(
      [
        {
          id: 'front-oblique',
          viewpoint: 'front-oblique',
          sameVariant: true,
          wholeProductVisible: true,
          independentGeometryEvidence: true,
        },
        {
          id: 'rear-oblique',
          viewpoint: 'rear-oblique',
          sameVariant: true,
          wholeProductVisible: true,
          independentGeometryEvidence: true,
        },
        {
          id: 'fabric-close-up',
          viewpoint: 'detail',
          sameVariant: true,
          wholeProductVisible: false,
          independentGeometryEvidence: false,
        },
      ],
      {
        name: 'microsoft/TRELLIS-image-large',
        supportsMultipleImages: true,
        licenseUsableInKr: true,
        minimumVramMiB: 16_384,
      },
      { gpuVramMiB: 12_288, minimumDistinctViews: 3 }
    )

    expect(result).toEqual({
      status: 'blocked',
      usableDistinctViews: 2,
      reasons: ['insufficient-distinct-product-views', 'insufficient-gpu-vram'],
    })
  })

  it('독립 시점·모델·라이선스·VRAM이 모두 충족되면 실험 실행을 허용한다', () => {
    const sources = ['front', 'side', 'rear'].map((viewpoint) => ({
      id: viewpoint,
      viewpoint,
      sameVariant: true,
      wholeProductVisible: true,
      independentGeometryEvidence: true,
    }))

    expect(
      assessMultiviewExperimentReadiness(
        sources,
        {
          name: 'multiview-model',
          supportsMultipleImages: true,
          licenseUsableInKr: true,
          minimumVramMiB: 12_000,
        },
        { gpuVramMiB: 16_000, minimumDistinctViews: 3 }
      )
    ).toEqual({ status: 'ready', usableDistinctViews: 3, reasons: [] })
  })

  it('다중 이미지 미지원 또는 한국 사용 불가 모델을 입력 수와 무관하게 차단한다', () => {
    const result = assessMultiviewExperimentReadiness(
      ['front', 'side', 'rear'].map((viewpoint) => ({
        id: viewpoint,
        viewpoint,
        sameVariant: true,
        wholeProductVisible: true,
        independentGeometryEvidence: true,
      })),
      {
        name: 'blocked-model',
        supportsMultipleImages: false,
        licenseUsableInKr: false,
        minimumVramMiB: 1,
      },
      { gpuVramMiB: 16_000, minimumDistinctViews: 3 }
    )

    expect(result.reasons).toEqual(['model-not-multiview', 'model-license-not-usable-in-kr'])
    expect(result.status).toBe('blocked')
  })

  it('현재 생성 메시와 공식 페이지 GLB를 같은 5% 비율 게이트로 비교한다', () => {
    const result = compareMeshBenchmarkCandidates(target, [
      {
        name: 'TripoSR single image',
        bounds: { w: 1.090591549873352, d: 0.8701017796993256, h: 0.49981820583343506 },
        triangles: 58_532,
        byteLength: 1_172_784,
      },
      {
        name: 'IKEA DIMMA official reference',
        bounds: { w: 2.2834267616271973, d: 0.9570343196392059, h: 0.8575109185430847 },
        triangles: 21_297,
        byteLength: 770_028,
      },
    ])

    expect(result[0]).toMatchObject({
      name: 'TripoSR single image',
      passesDimensionRatioGate: false,
    })
    expect(result[0].maxDimensionRatioError).toBeCloseTo(0.5209, 4)
    expect(result[1]).toMatchObject({
      name: 'IKEA DIMMA official reference',
      passesDimensionRatioGate: true,
    })
    expect(result[1].maxDimensionRatioError).toBeCloseTo(0.0306, 4)
  })

  it('시점별 후보 중 치수비 5%와 실루엣 0.75를 함께 통과한 최선 후보만 선택한다', () => {
    const result = selectMultiviewRegenerationCandidate(target, [
      {
        id: 'front-hires',
        name: 'front high resolution',
        viewpoint: 'front-oblique',
        sourceImageSha256: 'a'.repeat(64),
        bounds: { w: 2.25, d: 0.94, h: 0.82 },
        triangles: 50_000,
        byteLength: 1_000_000,
        silhouetteIou: 0.84,
      },
      {
        id: 'rear-hires',
        name: 'rear high resolution',
        viewpoint: 'rear-oblique',
        sourceImageSha256: 'b'.repeat(64),
        bounds: { w: 1.4, d: 0.88, h: 0.6 },
        triangles: 48_000,
        byteLength: 950_000,
        silhouetteIou: 0.9,
      },
    ])

    expect(result.status).toBe('gate-passed')
    expect(result.selectedCandidateId).toBe('front-hires')
    expect(result.bestAttemptId).toBe('front-hires')
    expect(result.reasons).toEqual([])
    expect(result.candidates[0]).toMatchObject({
      id: 'front-hires',
      passesDimensionRatioGate: true,
      passesSilhouetteGate: true,
    })
  })

  it('모든 시점의 치수비가 5%를 넘으면 가장 나은 시도만 남기고 게시 후보는 만들지 않는다', () => {
    const result = selectMultiviewRegenerationCandidate(target, [
      {
        id: 'front-hires',
        name: 'front high resolution',
        viewpoint: 'front-oblique',
        sourceImageSha256: 'a'.repeat(64),
        bounds: { w: 1.09, d: 0.87, h: 0.5 },
        triangles: 58_000,
        byteLength: 1_100_000,
        silhouetteIou: 0.92,
      },
      {
        id: 'rear-hires',
        name: 'rear high resolution',
        viewpoint: 'rear-oblique',
        sourceImageSha256: 'b'.repeat(64),
        bounds: { w: 1.5, d: 0.9, h: 0.6 },
        triangles: 55_000,
        byteLength: 1_050_000,
        silhouetteIou: 0.88,
      },
    ])

    expect(result.status).toBe('rejected')
    expect(result.selectedCandidateId).toBeUndefined()
    expect(result.bestAttemptId).toBe('rear-hires')
    expect(result.reasons).toContain('dimension-ratio-gate-failed')
  })

  it('치수비가 맞아도 실루엣 점수가 부족한 후보는 선택하지 않는다', () => {
    const result = selectMultiviewRegenerationCandidate(target, [
      {
        id: 'low-silhouette',
        name: 'low silhouette',
        viewpoint: 'front-oblique',
        sourceImageSha256: 'c'.repeat(64),
        bounds: { w: 2.25, d: 0.94, h: 0.82 },
        triangles: 45_000,
        byteLength: 900_000,
        silhouetteIou: 0.62,
      },
    ])

    expect(result.status).toBe('rejected')
    expect(result.selectedCandidateId).toBeUndefined()
    expect(result.bestAttemptId).toBe('low-silhouette')
    expect(result.reasons).toContain('silhouette-gate-failed')
  })

  it('부분 확대 후면 사진은 수치가 더 좋아도 전체 제품 재생성 후보로 선택하지 않는다', () => {
    const result = selectMultiviewRegenerationCandidate(target, [
      {
        id: 'front-whole-product',
        name: 'front whole product',
        viewpoint: 'front-oblique',
        sourceImageSha256: 'd'.repeat(64),
        bounds: { w: 1.09, d: 0.87, h: 0.5 },
        triangles: 58_000,
        byteLength: 1_100_000,
        silhouetteIou: 0.92,
        sameVariant: true,
        wholeProductVisible: true,
        independentGeometryEvidence: true,
      },
      {
        id: 'rear-detail',
        name: 'rear detail crop',
        viewpoint: 'rear-detail',
        sourceImageSha256: 'e'.repeat(64),
        bounds: { w: 2.25, d: 0.94, h: 0.82 },
        triangles: 113_000,
        byteLength: 2_200_000,
        silhouetteIou: 0.95,
        sameVariant: true,
        wholeProductVisible: false,
        independentGeometryEvidence: false,
      },
    ])

    expect(result.status).toBe('rejected')
    expect(result.selectedCandidateId).toBeUndefined()
    expect(result.bestAttemptId).toBe('front-whole-product')
    expect(result.reasons).toContain('dimension-ratio-gate-failed')
    expect(result.candidates.find((candidate) => candidate.id === 'rear-detail')).toMatchObject({
      passesDimensionRatioGate: true,
      passesSilhouetteGate: true,
      passesSourceEvidenceGate: false,
    })
  })
})
