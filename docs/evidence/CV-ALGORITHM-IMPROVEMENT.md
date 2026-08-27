# 2D→3D 도면 변환 평가 기준 감사 및 알고리즘 개선

평가일: 2026-08-27
결론: **로컬 CNN+벡터화 하이브리드가 유의미하게 개선했지만, 여전히 무검수 업무 자동화 수준은 아니다.**

## 1. 기존 평가 기준 감사

### Ground truth 파서

CubiCasa 공식 `House` 로더와 층화 표본 100건을 직접 비교했다.

| 항목 | 일치 |
|---|---:|
| 실내 방 개수 | 100/100 |
| 벽 개수 | 97/100 |
| 최대 방 개수 차이 | 0 |
| 최대 벽 개수 차이 | 4 |

벽 3건의 차이는 공식 로더가 너무 작은 벽을 제거하는 과정에서 발생했다. 방 F1의 정답 파싱은 공식 로더와 일치하며, 벽 F1은 작은 벽 포함 여부에 따른 제한을 가진다.

### 평가 격자 민감도

동일한 층화 100건을 128×128과 256×256 격자로 재평가했다.

| 지표 | 128 격자 | 256 격자 | 평균 절대 차이 |
|---|---:|---:|---:|
| 방 F1 | 32.89% | 33.07% | 0.61%p/사례 |
| 벽 F1 | 53.95% | 54.05% | 3.05%p/사례 |

집계 평균 차이는 방 0.18%p, 벽 0.09%p로 결론을 바꿀 수준이 아니다. 128 격자는 1,000건 반복 평가에 적절하고, 개별 사례의 정밀 경계 평가는 256 이상을 사용한다.

### 데이터 분리

1,000건을 아카이브 인덱스 기준으로 고정 분할했다.

- 개발 세트: `index % 10 === 0`, 100건
- 홀드아웃: 나머지 900건
- 파라미터 선택은 개발 100건에서만 수행
- 최종 개선 수치는 홀드아웃 900건에서 한 번 평가

## 2. 논문·알고리즘 검토

### Raster-to-Vector, ICCV 2017

[논문](https://openaccess.thecvf.com/content_iccv_2017/html/Liu_Raster-To-Vector_Revisiting_Floorplan_ICCV_2017_paper.html)은 저수준 이미지 규칙만으로는 위상적으로 닫힌 벽·방을 복원하기 어렵다고 보고, CNN 접합점 예측과 정수계획법으로 벽·문·아이콘을 조합한다. 약 90% precision/recall을 보고했으며 Manhattan 가정과 닫힌 루프 제약이 핵심이다.

적용 판단:

- 접합점/코너 히트맵과 의미 분할을 함께 써야 한다.
- 단순 H/V 런 검출만 조정하는 방식은 상한이 낮다.
- 출력 시 닫힌 루프·벽 연결성 제약이 필요하다.

### CubiCasa5K 다중작업 CNN, 2019

[논문](https://arxiv.org/abs/1904.01920)과 [공식 구현](https://github.com/CubiCasa/CubiCasa5k)은 벽/방 의미 분할, 접합점, 문·창문·아이콘을 함께 예측한다. 논문 test split에서 room mean IoU 57.5%, 후처리 room polygon mean IoU 49.3%를 보고한다.

적용 판단:

- 현재 데이터 분포와 직접 일치하는 가장 현실적인 로컬 기준 모델이다.
- 약 209MB 가중치를 로컬에서 실행할 수 있다.
- CC BY-NC 4.0이므로 상업적 사용 전 별도 라이선스 검토가 필요하다.

### HEAT, CVPR 2022

[HEAT](https://openaccess.thecvf.com/content/CVPR2022/papers/Chen_HEAT_Holistic_Edge_Attention_Transformer_for_Structured_Reconstruction_CVPR_2022_paper.pdf)는 코너 검출과 모든 코너 쌍의 edge 후보를 Transformer로 분류해 전체 평면 그래프를 복원한다.

적용 판단: 장기적으로 벽 연결성과 누락 벽 복원에 적합하지만, 현재 Raster CubiCasa 입력에 맞춘 재학습·라벨 변환이 필요하다.

### RoomFormer, CVPR 2023

[RoomFormer](https://github.com/ywyue/roomformer)는 방과 코너의 2단계 query로 여러 방 폴리곤을 직접 예측한다. 다만 입력이 2D 스캔 density map 중심이므로 일반 부동산 도면 이미지에는 재학습이 필요하다.

## 3. 고전 CV 후보 실험

개발 100건에서 두께·길이·모폴로지·색상 인식·해상도 적응 8개 프로필을 비교했다.

- 기본 프로필: 방 F1 31.39%, 벽 F1 54.23%
- 정답을 보고 사례마다 최적 프로필을 고르는 비현실적 oracle: 방 F1 36.40%, 벽 F1 56.19%

오라클 개선도 방 +5.01%p, 벽 +1.96%p에 불과했다. 고전 전처리 튜닝만으로 업무 수준에 도달할 가능성이 낮다는 실험 근거다.

## 4. 구현한 하이브리드

```text
도면 이미지
  → CubiCasa 다중작업 CNN 벽 의미 마스크
  → 1px 모폴로지 클로징
  → H/V 벽 벡터화(minThickness=2, minLength=40)
  → 방 플러드필·폴리곤 단순화
  → FloorPlan JSON
  → 기존 2D 편집기 / 3D 렌더러
```

개발 100건에서 최적 프로필을 고정한 뒤 홀드아웃 900건에 적용했다.

## 5. 홀드아웃 900건 결과

| 지표 | 기존 고전 CV | CNN 하이브리드 | 변화 |
|---|---:|---:|---:|
| 변환 성공률 | 94.56% | **97.56%** | +3.00%p |
| 방 개수 정확 일치 | 7.56% | **9.67%** | +2.11%p |
| 방 개수 ±1 | 19.44% | **28.33%** | +8.89%p |
| 방 F1@IoU 0.5 | 30.60% | **47.52%** | +16.92%p |
| 벽 F1 | 54.07% | **76.63%** | +22.56%p |
| 문 개수 일치도 | 50.65% | **59.51%** | +8.86%p |

유형별 하이브리드 방 F1:

- high_quality: 51.09%
- high_quality_architectural: 44.69%
- colorful: 46.55%

벽은 업무 후보 수준에 접근했지만 방 분할과 문 위치는 아직 부족하다. 특히 현재 하이브리드는 CNN의 문/창문 채널을 벡터화하지 않고 벽 갭 휴리스틱을 유지하므로 다음 개선의 핵심은 opening channel 직접 사용이다.

## 6. GPU·CPU 실행성

테스트 PC: NVIDIA RTX 3060 12GB.

- CNN 마스크 1,000건 GPU 평균: 75.3ms/건(배치 워밍업 포함)
- 브라우저 로컬 서버 첫 GPU 요청: 565.5ms
- 동일 도면 CPU 강제 실행: 750.5ms
- GPU/CPU 모두 1024×774 동일 크기 마스크 반환
- CUDA가 없으면 시작 시 CPU, CUDA OOM·드라이버 오류면 요청 중 CPU로 자동 재로드

이 모델은 LLM이 아니며 VRAM 12GB로 충분하다. CPU도 사용 가능하지만 PC 성능과 이미지 크기에 따라 수 초가 걸릴 수 있다.

## 7. 제품 연결

- `scripts/cv_inference_server.py`: CUDA 우선·CPU 자동 폴백 로컬 서버
- `scripts/setup_cv_runtime.py`: 공식 코드·가중치 준비
- `src/ui/PlanVisionModal.tsx`: 서버 자동 감지, CNN 사용, 실패 시 브라우저 고전 CV 폴백
- `npm run cv:setup` / `npm run cv:server`

이전 실패 사례 `high_quality/1514`는 고전 CV에서 벽 0·방 0이었지만, GPU 하이브리드에서 벽 13·방 6을 생성해 3D 렌더까지 완료했다. 정답 방은 7개이므로 여전히 수동 보정이 필요하다.

## 8. 업무 적용 판정과 다음 단계

현재 하이브리드도 무검수 자동화에는 부족하다. 사용 범위는 “초안 생성 + 필수 검수”로 유지한다.

다음 우선순위:

1. CubiCasa door/window 의미 채널을 직접 벡터화해 문·창문 위치 F1 평가
2. CNN room segmentation을 플러드필 대신 직접 폴리곤화하고 벽 그래프와 합의
3. 접합점 heatmap으로 끊긴 벽 연결, 닫힌 루프 제약 적용
4. 상업 사용 가능한 자체 데이터로 재학습하거나 CubiCasa 라이선스 확보
5. 홀드아웃에서 방 F1≥75%, 벽 F1≥80%, opening 위치 F1≥70%를 만족한 뒤 자동화 승격

## 9. 근거 파일

- 공식 로더 대조: `docs/evidence/cv-evaluation-ground-truth-check.json`
- 격자 256 감사: `docs/evidence/cv-accuracy-grid256-audit.json`
- 개발 프로필 결과: `docs/evidence/cv-profile-dev-*.json`
- 홀드아웃 900건: `docs/evidence/cv-accuracy-hybrid-holdout.json`
- GPU 1,000건 마스크 manifest: `docs/evidence/cubicasa-neural-mask-manifest.json`
- 공식 모델 가중치 SHA-256: `dd20b4e1bf1d670f2125107b079df06958b1ccd36e49a464ab739aeb00b8e7a2`
- 홀드아웃 결과 SHA-256: `dc7ae4cf9be7e3a06768a76d70d7371df5801f86c5c31aa31c405ce4f1c211ed`
- 브라우저 실패 사례 개선 화면: `output/playwright/cv-neural/.playwright-cli/page-2026-08-27T02-27-32-729Z.png`
- 상업·무료 라이선스 비교: `docs/evidence/CV-LICENSE-COMPARISON.md`
- 연구 단계 1 문·창 직접 벡터화: `docs/evidence/CV-RESEARCH-STAGE-1.md`
