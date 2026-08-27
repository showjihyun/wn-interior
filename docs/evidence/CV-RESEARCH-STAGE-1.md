# 연구 단계 1 — CubiCasa 하이브리드 문·창 직접 벡터화

적용일: 2026-08-27
범위: 사용자가 지정한 연구 단계 1만 적용

## 1. 적용 범위

- 현재 CubiCasa CNN + TypeScript 벡터화 하이브리드 유지
- CNN의 문·창문 의미 채널을 직접 `Opening`으로 벡터화
- 기존 1,000건 코퍼스와 동일 분할·평가 기준으로 전후 비교

자체 상업 모델 학습, SAM 2 재학습, 고객 데이터 수집 등 다음 단계는 적용하지 않았다.

전체 모델 전략은 `docs/evidence/CV-MODEL-STRATEGY.md`에 별도로 기록했다.

## 2. 변경 전 문제

기존 하이브리드는 CNN의 벽 마스크만 사용하고, 문은 벽선 사이의 gap으로 추정했다. 창문은 자동 검출하지 않았다.

```text
CNN wall mask
  → 벽 벡터화
  → 벽 gap 크기가 500~1400mm이면 door 후보
  → window 없음
```

홀드아웃 900건 기준:

| 지표 | 기존 방식 |
|---|---:|
| 문 개수 일치도 | 59.51% |
| 창 개수 일치도 | 0.67% |
| 문 위치 F1 | 18.98% |
| 창 위치 F1 | 0.67% |

## 3. 구현 로직

CubiCasa 출력 44채널 중 icon segmentation의 `window=1`, `door=2`를 직접 사용한다.

```text
CNN prediction
  ├─ room class 2/8 → wall mask
  ├─ icon class 2   → door mask
  └─ icon class 1   → window mask

door/window mask
  → 8방향 연결요소 라벨링
  → 너무 작은 component 제거
  → component 중심·bbox 계산
  → 가장 가까운 벽 선분에 직교 투영
  → 벽 방향 bbox 길이로 opening 폭 계산
  → 타입별 폭 clamp
  → 같은 벽의 중복 후보 제거
  → FloorPlan.openings
```

타입별 폭 범위:

| 타입 | 최소 | 최대 | 기본 높이 | sill |
|---|---:|---:|---:|---:|
| 문 | 500mm | 2,200mm | 2,000mm | 0mm |
| 창 | 400mm | 5,000mm | 1,500mm | 900mm |

각 후보는 최근접 벽 ID와 연결되고, 투영 지점에서 벽 시작점까지의 거리를 `offset`으로 저장한다. 기존처럼 모든 개구부가 `w1`에 귀속되던 문제도 함께 제거했다.

주요 구현:

- `src/engine/planVision.ts` — `vectorizeOpeningMask`
- `scripts/cv_inference_server.py` — wall/door/window mask 반환
- `src/ui/PlanVisionModal.tsx` — mask 디코딩·직접 벡터화·타입별 normalize
- `scripts/cv-accuracy-benchmark.ts` — 문·창 개수 및 위치 F1 평가

## 4. 평가 방법

기존 1,000건의 CubiCasa5K 층화 표본과 개발 100 / 홀드아웃 900 분리를 그대로 유지했다.

### 개수 일치도

```text
min(정답 개수, 예측 개수) / max(정답 개수, 예측 개수)
```

### 위치 F1

1. SVG 정답 door/window polygon의 중심과 장축 길이를 계산한다.
2. 예측 Opening의 벽 투영 중심과 폭을 계산한다.
3. 중심 거리가 `(정답 span + 예측 span) / 2` 이내인 후보를 거리순 일대일 매칭한다.
4. 매칭 결과의 precision/recall 조화평균을 위치 F1로 기록한다.

이 지표는 opening 중심 위치 정확도를 평가하며 mask IoU는 아니다. 아주 긴 창이나 비정형 문에서는 관대한 사례가 있을 수 있으므로 최종 시공 정확도의 근거로 사용할 수 없다.

## 5. 개발 세트 100건

| 지표 | 직접 CNN 채널 |
|---|---:|
| 문 개수 일치도 | 88.82% |
| 창 개수 일치도 | 80.63% |
| 문 위치 F1 | 88.55% |
| 창 위치 F1 | 83.71% |

개발 세트에서는 연결요소 크기, 최근접 벽 거리, 폭 범위만 확인했으며 최종 평가는 홀드아웃에서 수행했다.

## 6. 홀드아웃 900건 전후 비교

방·벽 입력과 벡터화 파라미터는 동일하게 고정하고 opening 경로만 변경했다.

| 지표 | 기존 gap 방식 | CNN 직접 채널 | 변화 |
|---|---:|---:|---:|
| 변환 성공률 | 97.56% | 97.56% | 동일 |
| 방 F1 | 47.52% | 47.52% | 동일 |
| 벽 F1 | 76.63% | 76.63% | 동일 |
| 문 개수 일치도 | 59.51% | **86.29%** | +26.78%p |
| 창 개수 일치도 | 0.67% | **80.44%** | +79.77%p |
| 문 위치 F1 | 18.98% | **87.07%** | +68.09%p |
| 창 위치 F1 | 0.67% | **82.97%** | +82.30%p |

문·창 의미 채널 직접 사용은 개발 세트뿐 아니라 홀드아웃에서도 큰 개선을 유지했다.

## 7. 전체 1,000건 최종 결과

| 지표 | 결과 |
|---|---:|
| 변환 성공률 | 97.60% |
| 방 F1 | 47.82% |
| 벽 F1 | 76.72% |
| 문 개수 일치도 | 86.54% |
| 창 개수 일치도 | 80.46% |
| 문 위치 F1 | 87.21% |
| 창 위치 F1 | 83.05% |
| 평균 평가 처리시간 | 195.3ms/건 |

opening은 크게 개선됐지만 방 F1 47.82%는 여전히 무검수 자동 업무 기준에 미달한다. 연구 단계 1의 판정은 **문·창 직접 벡터화 채택, 전체 결과는 초안+검수 정책 유지**다.

## 8. 실브라우저 검증

대표 `high_quality/3653`:

| 항목 | 정답 | 예측 |
|---|---:|---:|
| 방 | 5 | 5 |
| 문 | 6 | 7 |
| 창 | 3 | 3 |
| 문 위치 F1 | - | 92.31% |
| 창 위치 F1 | - | 100% |

RTX 3060 CUDA 서버에서 UI가 `벽 25 · 방 5 · 문 7 · 창 3`을 표시했고, 2D 적용 후 3D 렌더까지 성공했다. 콘솔 오류는 0건이었다.

로컬 화면 근거:

- CNN 프리뷰: `output/playwright/cv-stage1-openings/.playwright-cli/page-2026-08-27T04-00-49-942Z.png`
- 3D 결과: `output/playwright/cv-stage1-openings/.playwright-cli/page-2026-08-27T04-01-18-210Z.png`

## 9. 테스트

- Vitest: 16 files / 102 tests passed
- `vectorizeOpeningMask`: 문 투영, 창 방향 폭, 원거리 노이즈 제거 테스트
- Playwright: 고전 CV 회귀 + mock CNN door/window Opening 변환 통과
- 실제 GPU 서버·브라우저: CUDA 자동 선택, 문·창 2D/3D 반영, 콘솔 오류 0

## 10. 원자료와 해시

| 파일 | SHA-256 |
|---|---|
| `cv-stage1-openings-holdout-before.json` | `c45e52a7abff51fa45081db70f93fe7fdbdf77922d8594d62051f585b078d8f3` |
| `cv-stage1-openings-holdout-after.json` | `7a56a2573475d385acd3f9f24aba337d2b0ba2afe4df3d4d38996766ed5f336c` |
| `cv-stage1-openings-1000.json` | `10246852e2335268f0d9bbe999262ccbb36f8941520bf515e5b689225b7f52a9` |

근거 파일은 `docs/evidence/`에 저장한다.
