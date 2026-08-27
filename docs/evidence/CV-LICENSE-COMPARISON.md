# 도면 AI 무료·상업 라이선스 비교

조사일: 2026-08-27
목적: 2D 도면→3D 변환 모델을 상업 업무에 사용할 수 있는 데이터·코드·가중치 조합 선정

> 이 문서는 기술·라이선스 조사 기록이며 법률 자문이 아니다. 실제 상업 출시 전 원본 배포물에 포함된 LICENSE, 데이터 이용약관, 가중치 배포 조건을 법무 담당자가 다시 확인해야 한다.

## 판정 기준

| 표시 | 의미 |
|---|---|
| ✅ | 명시된 라이선스상 상업 사용이 가능한 후보. 고지·저작자 표시 등 의무는 준수해야 함 |
| ⚠️ | 상업 사용 가능성이 있으나 copyleft, 데이터 출처, 파생 가중치 또는 라이선스 누락 확인 필요 |
| ❌ | 비상업·연구 전용 조건이 명시되어 현재 상업 제품에 사용 불가 |

코드 라이선스와 학습 데이터·가중치 라이선스는 별개다. 예를 들어 MIT 코드라도 CC BY-NC 데이터로 학습한 가중치는 상업 배포 전에 별도 검토가 필요하다.

## 1. 도면 데이터셋 비교

| 데이터셋 | 규모·형식 | 라이선스 근거 | 상업 사용 | 현재 제품 적합성 | 주요 의무·위험 |
|---|---|---|---|---|---|
| **ResPlan** | 17,000개 주거 도면. 벽·문·창·방·발코니 벡터, 연결 그래프, 미터 좌표 | [공식 저장소: data CC BY 4.0, code MIT](https://github.com/m-agour/ResPlan#contents) | ✅ | **높음**. 벡터 정답으로 벽·방·opening 학습 가능 | 저작자·라이선스 표시, 변경 고지. 부동산 공개 listing에서 파생되어 provenance·takedown 정책 검토 필요 |
| **Modified Swiss Dwellings (MSD)** | 5,300+ 건물 평면, 18,900+ 아파트. 이미지·geometry·graph | [공식 연구 페이지](https://archilyse.standfest.science/modified-swiss-dwellings), [공식 저장소](https://github.com/caspervanengelenburg/msd) | ⚠️/✅ | 높음. 다세대·복합 평면과 room graph 보강 | 프로젝트 페이지는 CC BY 계열을 명시하지만 배포 채널별 metadata가 일관되지 않은 경우가 있어 다운로드 파일 LICENSE 재확인 필요. Attribution 유지 |
| **MSD JSON** | 4,572 room geometry·dual graph, 참고 이미지 250개 | [Zenodo DOI 10.5281/zenodo.17294451](https://zenodo.org/records/17294451) | ⚠️ | 중간. geometry/graph 학습에는 유용, raster 입력 다양성은 부족 | Zenodo 화면의 Rights 필드가 비어 있어 원본 archive와 기반 MSD 라이선스 확인 전 상업 사용 보류 |
| **ProcTHOR** | 절차 생성 3D 주택. 원하는 수만큼 top-view·벽·방 mask 생성 가능 | [공식 저장소 Apache 2.0](https://github.com/allenai/procthor) | ✅ | 중간. 자체 합성 pretraining·위상 데이터 확대에 유용 | Apache NOTICE·저작권 고지. 실제 부동산 도면 스타일과 domain gap 큼 |
| **자체 절차 생성 데이터** | 현재 합성 엔진을 확장해 무제한 생성 | 자체 저작물 | ✅ | **높음(보조 데이터)**. 노이즈·스캔·색상·한글 기호를 통제 가능 | 외부 texture/font를 넣을 때 해당 라이선스 확인. 실제 도면만의 분포를 대체할 수 없음 |
| **고객 제공 도면 + 명시적 학습 동의** | 실제 국내 도면. 라벨은 자체 구축 | 계약·동의서에 따름 | ✅ | **가장 높음**. 국내 아파트·한글·치수선 분포 반영 | 개인정보·주소 제거, 목적·보관기간·재학습 동의, 삭제 요청, 원저작권 확인 필수 |
| CubiCasa5K | 5,000 raster+SVG 주석 | [공식 LICENSE: CC BY-NC 4.0](https://github.com/CubiCasa/CubiCasa5k/blob/master/LICENSE) | ❌ | 연구·내부 비교에는 매우 높음 | NonCommercial. 현재 공식 가중치와 데이터는 상업 제품에서 제거하거나 별도 허가 필요 |
| Structured3D | 3,500 전문 3D 주택·풍부한 구조 주석 | [공식 Terms: non-commercial research/education](https://structured3d-dataset.org/) | ❌ | density map·3D 구조 연구용 | 데이터 재배포 금지, 비상업 연구·교육 한정. 코드 MIT와 데이터 조건을 혼동하면 안 됨 |
| FloorPlanCAD | 15,000+ CAD 도면 primitive annotations | [공개 데이터 목록 및 원 프로젝트 조건](https://floorplancad.github.io/) | ❌ | CAD symbol·thin line에는 유용 | annotation이 CC BY-NC 4.0으로 알려져 있어 상업 학습에는 부적합 |
| RPLAN | 약 80,000 생성용 raster layout | [공식 프로젝트 경유 배포](http://staff.ustc.edu.cn/~fuxm/projects/DeepLayout/index.html) | ❌/⚠️ | layout generation에는 유용하지만 image parsing과 다름 | 후속 공식 구현도 “terms 때문에 재배포 불가”라고 명시. 연구 요청형 데이터로 상업 사용 보류 |
| CVC-FP | 122개 실도면·구조 기호 | 공식 연구 배포 | ❌/⚠️ | 너무 작고 스타일 제한 | “free for research” 성격. 상업 허가 문구가 명확하지 않으므로 사용 보류 |
| ROBIN | 약 1,000 도면, 주로 분류·object 용도 | [공식 저장소 GPL-3.0](https://github.com/gesstalt/ROBIN) | ⚠️ | 보조 검증용 | GPL은 상업 사용을 금지하지 않지만 데이터 재배포·파생물의 copyleft 범위를 법무 검토해야 함 |

## 2. 모델·코드·가중치 비교

| 모델·프레임워크 | 코드 라이선스 | 체크포인트/학습 데이터 | 상업 사용 판정 | 12GB GPU | 제품 적용 평가 |
|---|---|---|---|---|---|
| **SAM 2** | [Apache 2.0](https://github.com/facebookresearch/sam2#license) | 공식 체크포인트도 Apache 2.0 | ✅ | Hiera tiny/small/base+ 가능 | **상업용 기반 모델 1순위**. 단, floorplan wall/room/opening 의미를 모르므로 ResPlan·MSD·자체 데이터로 fine-tuning 필요 |
| **자체 U-Net / SegFormer** | 자체 코드 또는 Apache/MIT 구현 선택 | ResPlan·MSD·자체 데이터로 직접 학습 | ✅ | 충분 | **가장 통제 가능**. 벽·방·문·창 채널을 제품 schema에 맞게 설계 가능 |
| Raster-to-Vector | [코드 MIT](https://github.com/art-programmer/FloorplanTransformation) | 원 raster는 LIFULL 권한 문제로 미공개, 기존 가중치 provenance 확인 필요 | ⚠️ | 가능하지만 구형 환경 | 접합점+위상 로직은 참고 가치 높음. 코드 아이디어를 재구현하고 자체 데이터로 재학습하는 편이 안전 |
| RoomFormer | [코드 MIT](https://github.com/ywyue/roomformer) | 공개 체크포인트는 Structured3D/SceneCAD 계열 | ⚠️ | 빌드 조정 시 가능 | 코드 재사용은 가능. Structured3D 기반 가중치는 비상업 데이터 조건 때문에 상업 제품에는 재학습 권장 |
| DeepFloorplan | [코드 GPL-3.0](https://github.com/zlzeng/DeepFloorplan) | R2V/R3D 원본 이미지와 annotation 조건이 분리됨 | ⚠️ | 가능하지만 TF1·Python2 구형 | GPL은 상업 사용을 금지하지 않지만 배포 시 copyleft 의무 검토. 기존 데이터·가중치 권리도 별도 확인 |
| CubiCasa5K CNN | CC BY-NC 4.0 배포물 | CubiCasa5K CC BY-NC 학습 | ❌ | **현재 12GB에서 75ms/건 확인** | 정확도 benchmark·내부 연구용. 상업 배포 전 별도 라이선스 또는 완전 재학습 필요 |
| HEAT | 저장소에 GPL 표기가 있으나 README가 code/data/checkpoint 비상업 연구 전용 명시 | Structured3D 기반 | ❌ | 공식 학습은 다중 16GB GPU 권장 | 알고리즘 참고용. 현 체크포인트·데이터를 상업 제품에 사용하지 않음 |
| OpenCV | [Apache 2.0](https://github.com/opencv/opencv) | 해당 없음 | ✅ | CPU/GPU 선택 | 전처리·벡터 후처리에 안전한 선택 |
| PyTorch | [BSD-3-Clause 중심](https://github.com/pytorch/pytorch) | 모델별 별도 | ✅ | 현재 RTX 3060 동작 확인 | 학습·로컬 추론 runtime으로 사용 가능 |
| ONNX Runtime | [MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) | 모델별 별도 | ✅ | CUDA/DirectML/CPU | 최종 자체 모델 배포 runtime으로 권장 |

## 3. 라이선스별 실무 요약

| 라이선스 | 상업 사용 | 소스 공개 의무 | 핵심 의무 |
|---|---|---|---|
| MIT / BSD | 가능 | 일반적으로 없음 | 저작권·라이선스 고지 유지 |
| Apache 2.0 | 가능 | 일반적으로 없음 | LICENSE/NOTICE 유지, 변경 고지, 특허 조항 준수 |
| CC BY 4.0 | 가능 | 없음 | 데이터 출처·저작자·라이선스 표시, 변경 표시 |
| GPL-3.0 | 가능 | 배포 형태에 따라 있음 | 파생·결합 배포의 copyleft 범위 법무 검토 |
| CC BY-NC 4.0 | 비상업만 | 해당 없음 | 상업적 이익을 주목적으로 하는 사용 금지 |
| Research-only/custom | 보통 불가 | 계약에 따름 | 기관·연구 목적 제한, 재배포 금지 가능 |
| 라이선스 없음/불명 | 권한 없음으로 취급 | 불명 | 저작권자에게 명시적 허가를 받기 전 사용 금지 |

## 4. 권장 상업 조합

| 구성 | 권장 선택 | 이유 |
|---|---|---|
| 실제 구조 데이터 | **ResPlan CC BY 4.0** | 벽·방·문·창·미터 좌표가 모두 있어 현재 schema와 가장 가까움 |
| 복합·다세대 보강 | **MSD 계열 CC BY 확인본** | 단독 아파트 위주 편향을 줄임. archive LICENSE 확인 후 사용 |
| 합성 pretraining | **ProcTHOR Apache 2.0 + 자체 생성기** | 상업 친화적이고 스타일·노이즈를 통제 가능 |
| 국내 domain 데이터 | **고객 동의 도면 + 자체 라벨** | 한국 아파트·한글·치수선 성능을 결정하는 핵심 데이터 |
| 기반 모델 | **SAM 2 Apache 2.0 또는 자체 SegFormer/U-Net** | 코드·체크포인트 상업 사용 조건이 명확함 |
| 벡터화 | **현재 TypeScript 엔진 + 자체 접합점/루프 제약** | 외부 가중치 라이선스와 분리 가능 |
| 추론 runtime | **ONNX Runtime MIT** | GPU/CPU fallback과 배포가 용이함 |

## 5. 권장 실행 순서

1. CubiCasa 모드는 `research-only`로 표시하고 외부 상업 배포물에서 기본 비활성화한다.
2. ResPlan과 라이선스 확인이 끝난 MSD를 받아 벡터→다양한 raster 스타일 학습쌍을 생성한다.
3. ProcTHOR·자체 생성기로 벽 두께, 스캔 노이즈, 색상, 치수선, 문·창 스타일을 확대한다.
4. SAM 2 adapter 또는 자체 SegFormer/U-Net을 벽·방·문·창 4개 핵심 채널로 학습한다.
5. 국내 실제 도면을 명시적 동의하에 수집해 fine-tuning과 별도 홀드아웃 평가에만 사용한다.
6. 상업 가중치에는 학습 데이터 manifest, 원본 라이선스, attribution, 삭제 이력을 함께 버전 관리한다.

## 6. 최종 판정

- **즉시 상업 제품에 사용할 수 있는 기존 floorplan 전용 가중치:** 이번 조사에서 충분히 명확한 후보를 찾지 못함.
- **무료로 상업용 모델을 만들 수 있는 경로:** ResPlan/MSD 확인본/ProcTHOR/자체 데이터 + SAM 2 또는 자체 segmentation 모델.
- **현재 CubiCasa 하이브리드:** 내부 연구·성능 기준선으로 유지하되 상업 출시물에는 별도 허가 없이 포함하지 않음.

가장 안전한 방향은 “상업 허용 데이터로 자체 가중치를 재학습하고 ONNX Runtime으로 배포”하는 것이다.
