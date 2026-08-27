# 도면 변환 모델 전략 — 사전학습·자체학습·Zero-shot 통합안

작성일: 2026-08-27
상태: 전략 문서. 이번 구현 범위는 연구 단계 1만 완료.

## 1. 모델 후보

| 모델 | 학습 상태 | 장점 | 제약 | 12GB GPU | 판단 |
|---|---|---|---|---:|---|
| CubiCasa CNN | 도면 5,000건 학습 | 벽·방·문·창 채널, 현재 즉시 실행 가능 | CC BY-NC, 상업 사용 불가 | 충분 | 연구 기준선 |
| DeepFloorplan | R2V/R3D 학습 | 방 경계·유형 다중작업 | GPL-3.0, TF1/Python2, 데이터 권리 분리 | 충분 | 기존 가중치 비권장 |
| MitUNet | CubiCasa 학습 | 얇은 벽·경계 특화 | 코드 MIT, 가중치 CC BY-NC | 충분 | 연구 참고 |
| PCP-Net | CubiCasa 학습 | 논문 기준 높은 semantic parsing 성능 | 공개 가중치·상업 라이선스 확인 부족 | 충분 | 연구 참고 |
| Raster2Seq | 여러 floorplan benchmark 학습 | 방 폴리곤을 sequence로 직접 생성 | 최신 연구, 제품용 가중치·라이선스 검증 필요 | 조건부 | 장기 검토 |
| SAM 2 | 범용 이미지 사전학습 | Apache 2.0, 정밀 경계 보정 | 도면 의미를 모르므로 단독 사용 불가 | 충분 | 보조 모델 추천 |
| 자체 SegFormer/U-Net | 상업 허용 데이터로 학습 | 출력 채널·라이선스·배포 완전 통제 | 데이터 생성·라벨링·학습 필요 | 충분 | 상업 최종안 |

## 2. 권장 최종 구조

```text
도면 이미지
  → 자체 학습 semantic parser
      wall / room / door / window / junction / ignore
  → SAM 2 저신뢰 경계 보정
  → PaddleOCR 치수·방 이름 인식
  → 벽 그래프 최적화
      직교화 / 끝점 병합 / 닫힌 루프 / opening 귀속
  → 신뢰도 검사 + 사용자 보정
  → FloorPlan JSON → 3D
```

SAM 2와 VLM은 구조 좌표를 직접 생성하지 않고, 학습 모델의 경계·의미를 보조하는 역할로 제한한다.

## 3. 상업 학습 데이터 구성

| 데이터 | 역할 | 라이선스 판단 |
|---|---|---|
| ResPlan 17,000건 | 벽·방·문·창·metric geometry | CC BY 4.0 |
| 라이선스 확인 MSD | 복합·다세대 구조 | CC BY 계열, archive 확인 필요 |
| ProcTHOR | 합성 위상·방 구조 확대 | Apache 2.0 |
| 자체 절차 생성 | 선 두께·색상·스캔·치수선 증강 | 자체 저작물 |
| 고객 동의 국내 도면 | 한국 아파트·한글·실제 분포 fine-tuning | 계약·동의 범위 |
| CubiCasa | 연구 평가 전용 | CC BY-NC, 상업 학습 제외 |

벡터 데이터는 흑백·컬러·얇은 CAD·두꺼운 벽·JPEG·스캔 노이즈·기울기·한글·다양한 문/창 심볼로 rasterize해 학습쌍을 만든다.

## 4. 12GB GPU 권장 사양

| 항목 | 권장 |
|---|---|
| Backbone | SegFormer-B0/B2 또는 U-Net ResNet34 |
| 입력 | 768×768 또는 1024×1024 tile |
| 출력 | wall/room/door/window + junction heatmap |
| Loss | Dice + Focal/Tversky + boundary loss |
| 학습 | AMP, batch 1~4, gradient accumulation |
| SAM 2 | Hiera small/base+, 모델 순차 실행 |
| 배포 | ONNX Runtime CUDA 우선, CPU 자동 폴백 |
| CPU 최적화 | INT8 quantization |

## 5. 단계별 계획과 적용 상태

| 단계 | 내용 | 상태 |
|---|---|---|
| 연구 단계 1 | CubiCasa 하이브리드 유지, 문·창 직접 벡터화, 1,000건 비교 | **완료** |
| 상업 모델 1차 | ResPlan·MSD·ProcTHOR 기반 자체 SegFormer/U-Net | 미적용 |
| 국내 보정 | 동의받은 국내 도면 fine-tuning | 미적용 |
| 기반 모델 보조 | SAM 2 경계 refinement·PaddleOCR 치수 인식 | 미적용 |
| 상업 배포 | 자체 가중치 ONNX 변환·INT8·GPU/CPU 배포 | 미적용 |

연구 단계 1의 구현과 지표는 `docs/evidence/CV-RESEARCH-STAGE-1.md`에 분리 기록한다.

## 6. 업무 승격 기준

- 방 F1 ≥ 75%
- 벽 F1 ≥ 80%
- 문·창 위치 F1 ≥ 70%
- 축척 오차 ≤ 3%
- 저신뢰 결과 자동 차단
- 상업 가중치의 학습 데이터 manifest·라이선스·삭제 이력 완비

현재 연구 단계 1은 문·창 기준을 넘었지만 방 F1이 47.82%이므로 전체 자동화 승격 조건을 충족하지 못한다.
