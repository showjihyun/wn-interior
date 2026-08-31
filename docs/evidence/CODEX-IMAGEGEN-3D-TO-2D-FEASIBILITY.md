# Codex 이미지 생성 기반 3D→2D 10건 비교 가능성 검토

검토일: 2026-08-31

## 결론

조건부로 가능하다. 다만 현재 HomePlan과 Codex 이미지 생성을 그대로 대결시키면 공정한 모델 비교가 아니다.

- HomePlan의 3D→2D 전환은 같은 `Project.plan`을 SVG로 다시 렌더한다. 벽·방·개구부 좌표와 mm 축척을 이미 알고 있다.
- Codex 이미지 생성은 3D 스크린샷의 보이는 픽셀만 입력받아 2D 래스터를 추정한다. 가려진 벽, 개구부, 축척과 위상을 복원해야 한다.
- 따라서 현재 가능한 실험은 **구조화 상태 렌더링을 상한선으로 두고 이미지 생성이 기하를 얼마나 복원하는지 보는 탐색 벤치마크**다.
- “어느 시스템이 더 우수한 3D 이미지 역변환기인가”를 공정하게 판정하려면 HomePlan에도 3D 스크린샷만 받는 역변환기를 먼저 구현해야 한다.

OpenAI 공식 문서는 GPT Image가 이미지 입력을 사용한 생성·편집을 지원한다고 설명하지만, vision 모델은 정밀한 공간 위치 추론에서 어려움을 겪고 잘못된 결과를 낼 수 있다고 명시한다.

- 공식 근거: <https://developers.openai.com/api/docs/guides/images-vision>

## 권장하는 1차 10건 실험

목적을 “정답 Project에서 렌더한 3D만 보고 2D 평면의 구조를 얼마나 복원하는가”로 제한한다.

### 입력과 정답

각 사례는 다음을 고정한다.

1. 정답 `Project v1`과 2D SVG raster
2. 동일한 카메라·조명·해상도의 3D top view 1장
3. 서로 반대 방향의 isometric view 2장
4. 가구를 제거한 structural 입력과 가구가 있는 realistic 입력 중 하나를 사전에 고정

10건은 방 1–6개, L자 외곽, 긴 복도, 내부 개구부, 창 밀도, 작은 방과 큰 거실이 섞이도록 층화한다. 같은 평면의 가구 배치만 바꾼 사례를 서로 다른 10건으로 세지 않는다.

### 비교군

| 비교군         | 입력                           | 출력                        | 해석                    |
| -------------- | ------------------------------ | --------------------------- | ----------------------- |
| HomePlan       | `Project.plan`                 | SVG 2D raster               | 구조화 상태 기반 상한선 |
| Codex imagegen | 3D top + isometric images only | 생성된 2D floor-plan raster | 이미지 기반 역복원      |
| Ground truth   | 원본 `Project.plan`            | 정답 mask·graph             | 두 결과의 공통 기준     |

HomePlan이 정답 상태를 읽는다는 이점을 모든 결과표 제목과 결론에 반복해서 표시한다.

### 고정 프롬프트

사례마다 내용·표현을 바꾸지 않고 같은 프롬프트를 사용한다.

```text
Use case: scientific-educational
Asset type: geometry reconstruction benchmark output
Primary request: reconstruct a clean orthographic 2D floor plan from the supplied views
Input images: top view and two opposite isometric views of the same interior
Style/medium: black architectural line drawing on white, no perspective
Constraints: preserve exterior outline, room adjacency, wall count, door/window locations and relative dimensions; omit furniture, shadows, textures, labels and decorative additions
Avoid: invented rooms, curved walls, perspective, 3D shading, dimensions not supported by the inputs
```

### 측정 지표

이미지 생성 결과는 구조화 데이터가 아니므로 같은 후처리를 적용해 mask와 graph로 변환한 뒤 평가한다.

| 지표             | 계산                                      | 우선순위 |
| ---------------- | ----------------------------------------- | -------- |
| 외곽 shape IoU   | 정렬한 내부 영역 mask 교집합/합집합       | 1        |
| 벽 centerline F1 | 정답 벽에서 허용 거리 내 precision/recall | 1        |
| 방 위상 정확도   | 방 개수와 adjacency graph 일치            | 1        |
| opening 위치 F1  | 벽 길이로 정규화한 offset 허용 오차       | 1        |
| 축척 오차        | 외곽 종횡비와 알려진 한 변의 상대 오차    | 2        |
| 시각 가독성      | 블라인드 사람이 방 경계를 해석 가능한지   | 보조     |

한 사례의 평균 점수만 내지 않고 치명 오류를 별도 집계한다: 외곽 단절, 방 합치기/분할, 출입 불가능한 방, 문·창 발명, 가려진 벽 누락.

## 결과 해석 제한

- 10건 × 1회 생성은 분산을 측정하지 못하므로 탐색 결과일 뿐 일반 성능 수치가 아니다.
- 재현성까지 평가하려면 사례당 최소 3회, 총 30회 생성이 필요하다.
- top view를 주면 역복원이 쉬워지고 isometric만 주면 가림이 커진다. 입력 view 조건을 결과와 함께 공개해야 한다.
- 사람이 생성 결과를 손으로 고치면 자동 변환 정확도와 수정 후 품질을 분리해 기록해야 한다.
- 이미지 생성 결과를 직접 mm 도면이나 배치 데이터로 사용하지 않는다.

## 실행 판정

- **GO:** 위 비대칭을 공개한 10건 탐색 벤치마크, 평가용 raster 산출물 생성
- **NO-GO:** 10건 결과만으로 Codex 또는 HomePlan의 일반 정확도·상용 적합성을 선언
- **선행 결정:** 구조화 상태 상한선 비교를 바로 실행할지, HomePlan의 screenshot-only 역변환기를 먼저 개발해 공정 비교할지 선택

권장안은 먼저 10건 탐색 벤치마크를 실행해 오류 유형과 평가 자동화 비용을 확인하는 것이다. 그 결과에서 반복되는 오류가 확인될 때만 screenshot-only 역변환기 개발을 다음 항목으로 승격한다.

## 실행 결과

권장한 10건 탐색 벤치마크를 2026-08-31 실행했다. 결과와 전체 입력·출력 증거는 [HomePlan vs Codex imagegen 3D→2D 탐색 비교](CODEX-IMAGEGEN-3D-TO-2D-RESULTS.md)에 보존한다.
