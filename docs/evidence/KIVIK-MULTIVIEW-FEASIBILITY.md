# KIVIK 다중 시점 재구성 타당성 실험

- 기준일: 2026-08-28
- 대상: IKEA KIVIK 3인용소파 Gunnared blue, 694.848.73
- 목적: 실제 다중 시점 재구성 파이프라인을 확대하기 전에 데이터·하드웨어·정량 품질 개선 가능성을 KIVIK 한 건으로 판단한다.
- 배포 경계: 모든 IKEA 이미지와 GLB는 `.runtime/` 또는 quarantine의 Git 제외 경로에만 저장하며 MIT 배포·published manifest에 포함하지 않는다.

## 입력 증거

공식 상품 페이지: <https://www.ikea.com/kr/en/p/kivik-3-seat-sofa-gunnared-blue-s69484873/>

페이지에서 확인한 KIVIK 관련 이미지 6개를 내려받아 SHA-256을 고정했다. 회전 검수 전에는 PE760802를 후면 전체 시점으로 분류했지만, 실제 원본과 생성 회전 뷰를 확인한 결과 한쪽 좌석 구간만 보이는 부분 확대 이미지였다. 따라서 전체 제품의 독립 기하를 보여주는 시점은 정면 사선 1개뿐이다.

| 시점           | 공식 이미지                                                                                                     | SHA-256                                                            | 판정                    |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| 정면 사선      | [PE1032891](https://www.ikea.com/kr/en/images/p/307eb7c47e732af3/kivik-3-seat-sofa-gunnared-blue/PE1032891.jpg) | `fadf574575297810d5ae0cae32204071b88adb2de473f87853deaadaf1ac799e` | 사용 가능               |
| 후면 부분 확대 | [PE760802](https://www.ikea.com/kr/en/images/p/24ba043e2b34ca2e/kivik-3-seat-sofa-gunnared-blue/PE760802.jpg)   | `d210c535c9d1fab6bd826e51fce9ce0f42a7e018d5aef644fd7f0add7a89673e` | 전체 제품 미노출로 제외 |

나머지 4개도 원단·지퍼·생활 연출 부분 확대 또는 다른 커버의 내부 절개 이미지라 전체 형상 재구성 입력에서 제외했다. 사전에 정한 최소 3개 독립 전체 시점 중 1개만 충족한다.

## 모델·환경

- 현재 모델 TripoSR은 단일 이미지 입력이다.
- Microsoft TRELLIS는 tuning-free multi-image conditioning과 GLB 추출을 제공하며 MIT 라이선스다. 공식 README의 최소 GPU 메모리는 16GB이고 Linux에서만 시험됐다고 명시한다: <https://github.com/microsoft/TRELLIS>
- 현재 GPU는 NVIDIA GeForce RTX 3060 12GB(`12,288 MiB`)다.
- Hunyuan3D-2mv는 1~4개 뷰를 지원하지만 해당 라이선스가 대한민국에는 적용되지 않아 후보에서 제외했다: <https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE>

결과: 입력 시점 부족과 VRAM 부족이 동시에 발생해 TRELLIS 설치·추론을 실행하지 않았다. 이는 설치 실패가 아니라 사전 계약에 따른 중단이다.

## A/B 품질 상한선

상품 페이지 HTML에서 IKEA DIMMA의 Draco GLB를 발견해 로컬 참고자산으로만 검사했다.

- SHA-256: `7ce04fb0e8e4a8c40c80a3ccff9346430e9e2da93422d212aa6d6373f8cbf049`
- bytes: `770,028`
- geometry: 20,982 vertices, 21,297 triangles
- embedded PBR: base color, normal, occlusion, metallic/roughness textures
- declared bounds: W `2.2834`, D `0.9570`, H `0.8575`

| 후보                         | 최대 공식 치수 비율 오차 | triangles |     bytes | 결과           |
| ---------------------------- | -----------------------: | --------: | --------: | -------------- |
| A — TripoSR 단일 이미지      |                   52.09% |    58,532 | 1,172,784 | 5% 게이트 실패 |
| B — IKEA DIMMA 공식 참고 GLB |                    3.06% |    21,297 |   770,028 | 5% 게이트 통과 |

## 2026-08-31 고해상도 재생성·시점 증거 게이트

12GB 환경에서 실행 가능한 개선으로, TripoSR에 해시 고정된 고해상도 시점을 순차 입력하고 각 결과를 독립 검사하는 후보 선택 파이프라인을 추가했다.

| 후보                    | 최대 치수비 오차 | silhouette IoU | 시점 증거        | 자동 결과                 |
| ----------------------- | ---------------: | -------------: | ---------------- | ------------------------- |
| 기존 저해상도 정면      |           52.09% |         0.9230 | 전체 제품        | 실패                      |
| 고해상도 정면           |           51.69% |         0.9285 | 전체 제품        | 치수비 실패               |
| 고해상도 후면 부분 확대 |           43.43% |         0.9530 | 전체 제품 미노출 | 소스 증거 게이트에서 제외 |

부분 확대 후보는 수치가 더 좋아도 선택하지 않는다. 최종 보존 후보는 고해상도 정면이며 기존 대비 0.40%p 개선에 그쳐 5% 게이트와 사람 검수 준비도를 통과하지 못했다. `published-manifest.v2.json`은 변경하지 않았다.

공식 참고 GLB는 실제 앱의 Draco loader에서 렌더되고 공식 2280×950×830mm selection envelope 안에 들어가는 것을 확인했다. 시각 증거는 `output/playwright/kivik-official-reference-top.png`와 `kivik-official-reference-iso.png`다.

## 결론

현재 확보 데이터는 독립 전체 시점이 1개뿐이고 12GB GPU로 새 다중 시점 생성 모델을 설치할 실익도 낮다. 공식 참고 GLB가 생성 후보보다 작고 치수 비율도 정확하며 시각 품질도 높다.

다음 의사결정은 다음 순서가 합리적이다.

1. 상품 페이지가 제공하는 공식 3D 자산의 사용 조건을 별도로 확인하고, 허용되는 경우 로컬 참조·사용자 직접 연결 경로를 검토한다.
2. 배포가 허용되지 않으면 공식 치수 기반 파라메트릭 메시와 사진 재질을 개선한다.
3. 동일 제품의 전체 형상 사진이 3개 이상 확보되고 16GB 이상 GPU 실행 환경이 준비될 때만 TRELLIS A/B를 재개한다.

## 후속 사전점검: 공식 3D 자동 연결 어댑터

2026-08-28 현재 카탈로그의 IKEA 12개 항목에 대해 각 공식 페이지 HTML의 DIMMA GLB 노출 여부를 읽기 전용으로 확인했다.

- HTTP 200: 12/12
- DIMMA GLB 발견: 1/12 — KIVIK만 해당
- 개별 SKU가 아닌 카테고리 링크: PAX 1건
- 현재 KIVIK GLB 응답: `model/gltf-binary`, 770,028 bytes, CORS `*`, `Cache-Control: public,max-age=3600`

기술적으로 KIVIK 직접 로드는 가능하지만 범위가 8.3%에 불과하고 URL은 안정성이 보장된 공개 카탈로그 API 계약이 아니다. IKEA Korea 페이지나 GLB 응답에서 재사용·재배포 허가도 확인하지 못했다. 다른 지역 IKEA 이용약관 역시 사이트 콘텐츠 권리를 IKEA 또는 라이선서가 보유하며 의도된 목적 밖의 복제·배포를 제한한다고 설명한다.

판정: 범용 official-3D discovery/runtime adapter는 현재 필요하지 않다. KIVIK GLB는 `.runtime/`의 로컬 품질 참고자료로만 유지하고 production·published manifest·MIT 배포에는 연결하지 않는다. 다음 우선순위는 11/12 상품에도 적용되는 실측 파라메트릭 형상과 공식 사진 재질 개선이다.

## 후속 적용: 전용 파라메트릭 폴백

생성 메시를 게시하지 않는 대신 공식 상품 치수와 DIMMA 비율 상한선을 전용 `kivikSofa` 프로필에 반영했다.

- 전체: 2280×950×830mm
- 좌석: 폭 1800mm, 깊이 600mm, 높이 450mm
- 팔걸이: 전체 폭과 좌석폭 차이에서 산출한 좌우 각 240mm
- 쿠션: 공식 대표 사진 기준 좌방석 2개, 등쿠션 2개
- DIMMA 전체 비율 오차: 3.06% — 프로필 envelope 교차검증 근거

공식 GLB의 세부 메시를 복제하거나 배포하지 않으며, 위 공식 치수와 시각적으로 확인 가능한 부품 구성만 코드로 재구성했다.
