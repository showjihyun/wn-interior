# 실측 데이터 + 검수 생성 메시 하이브리드 계획

- 결정일: 2026-08-28
- 사용자 약속: 가격·SKU·공식 치수·배치·충돌은 검증 가능한 상품 데이터로 계산하고, 생성 메시에는 시각적 표현만 맡긴다.
- 시작 상태: IKEA Korea 실상품 6종은 공식 이미지 데칼과 파라메트릭 형상을 사용하며 승인된 생성 GLB는 0개다.
- 종료 상태: 승인 manifest에 등록된 자산만 GLB로 렌더하고, 미승인·로딩·파싱 실패는 기존 형상+공식 사진으로 복구한다.

## 1. 신뢰 경계

| 계층                      | 진실 원천                                | 생성 메시 사용 여부 |
| ------------------------- | ---------------------------------------- | ------------------- |
| 가격·SKU·상품 링크        | 공식 판매 페이지 스냅샷                  | 금지                |
| W/D/H·설치 높이           | `Product.dims`, `Placement.dimsOverride` | 금지                |
| 방 경계·충돌·선택 outline | 실측 치수 AABB                           | 금지                |
| 표면·실루엣·PBR 재질      | 승인 GLB 또는 사진 데칼                  | 허용                |
| 프로젝트 저장·Undo/Redo   | 도면·배치·사용자 상품                    | 생성 상태 저장 금지 |

생성 메시 자산과 상태는 `Product`, `Placement`, `Project`에 넣지 않는다. 자산은 삭제·재생성 가능한 파생 데이터이며 승인 카탈로그가 제품 ID로 조회한다.

## 2. 승인 파이프라인

```text
사용 권리가 확인된 상품 이미지
  → 브라우저 밖 GPU worker
  → quarantine GLB
  → SHA-256·GLB 2.0·내장 리소스 검사
  → 공식 W/D/H 종횡비·triangle budget·silhouette 검사
  → 3개 이상 회전 시점 사람 검수
  → content-addressed public GLB + approved manifest
  → 런타임 mesh 우선 / 실패 시 Shape+decal
```

생성 worker는 브라우저 프로세스에 포함하지 않는다. `mesh:stage`는 localhost worker만 호출해 결과를 `artifacts/generated-mesh/quarantine/`에 저장하고, `mesh:publish`는 별도 권리 증거와 3시점 이상 사람 검수를 조합해 PII 없는 `published-manifest.v2.json`만 브라우저에 제공한다. 실제 판매상품 승인 자산은 권리 증거가 준비되기 전까지 0개로 유지한다.

## 3. 승인 게이트

- 제품 ID와 원본 이미지 URL/SHA-256 일치
- `/catalog/generated/<sha256>.glb` content-addressed 경로
- 한국에서의 상업 사용과 파생물 사용 권리 확인
- glTF/GLB 2.0, 외부 buffer·image URI 금지
- animation·skin·camera 금지
- 유한한 양수 bounds, 1~500,000 triangles
- 공식 W/H, D/H 비율 최대 오차 5% 이하
- 입력 시점 silhouette IoU 0.75 이상
- 사람이 3개 이상의 회전 시점을 확인하고 명시적으로 승인
- `visualOnly: true`; 충돌·설치 판단 사용 금지

`npm run test:mesh-assets`는 공개 manifest의 현재 product fingerprint, 파일 크기, SHA-256, GLB 컨테이너, 실제 POSITION/index 기반 bounds·triangle, symlink·orphan GLB를 배포 전에 다시 검사한다.

## 4. 렌더 순서

1. 승인 메시가 준비되면 메시만 표시한다.
2. 메시 로딩 중 또는 오류이면 파라메트릭 형상+공식 사진 데칼을 표시한다.
3. 사진도 없거나 로드하지 못하면 파라메트릭 형상만 유지한다.
4. 생성 메시의 bounds는 공식 W/D/H envelope 안에 uniform contain fit하며, 선택·충돌 overlay는 계속 공식 치수를 사용한다.
5. 기존 사용자 입력 GLTF는 `user-model` 미검증 경로로 분리하고 승인 생성 메시로 표시하지 않는다.

## 5. 점진적 도입

1. 현재 6종은 사진 기반 3D 폴백으로 유지한다.
2. 사용 권리와 다중 시점 이미지가 확보된 SKU를 우선 quarantine에서 생성한다.
3. 상품군별 대표 20~30건으로 품질·GPU 비용·다운로드 크기를 벤치마크한다.
4. 승인된 SKU만 manifest에 하나씩 추가한다.
5. 실패율과 수동 검수 시간을 관찰한 뒤 worker 종류와 자동화 범위를 결정한다.

## 6. 완료 조건

- 미승인 manifest 항목은 런타임에서 조회되지 않는다.
- 손상·외부 리소스 GLB와 해시 불일치는 빌드 전에 실패한다.
- 승인 메시 오류가 Canvas 전체 실패로 번지지 않는다.
- 메시와 사진 데칼이 동시에 중첩 렌더되지 않는다.
- `dimsOverride`가 drop·충돌·selection·visual envelope에 일관되게 반영된다.
- 단위·E2E·production preview 및 `npm run verify`가 통과한다.

## 7. 시점 증거 게이트

- 다중 시점 후보는 동일 SKU·변형, 전체 제품 노출, 독립 기하 증거를 모두 만족해야 한다.
- 부분 확대·원단 상세·다른 커버 절개 이미지는 치수비나 실루엣 수치가 좋아도 생성 후보 선택에서 제외한다.
- 12GB 환경에서는 적격 시점을 순차 단일 이미지 생성한 뒤 동일 게이트로 비교할 수 있지만 이를 다중 이미지 모델 추론이라고 부르지 않는다.
- KIVIK 고해상도 정면 재생성은 치수비 오차 51.69%로 실패했으며 공식 사진+파라메트릭 폴백을 유지한다.

## 8. KIVIK 제품 전용 폴백

- KIVIK 생성 메시가 게이트를 통과하지 못하는 동안 범용 `sofa3` 대신 전용 `kivikSofa` 프로필을 사용한다.
- 공식 좌석폭 1800mm·깊이 600mm·높이 450mm와 낮은 240mm 팔걸이, 좌방석·등쿠션 각 2개를 유지한다.
- DIMMA 로컬 참고 GLB는 전체 W/H·D/H 비율 검증에만 사용하며 런타임 자산이나 배치 데이터가 아니다.
- 사진과 메시가 모두 실패해도 전용 프로필이 공식 2280×950×830mm envelope를 제공한다.
