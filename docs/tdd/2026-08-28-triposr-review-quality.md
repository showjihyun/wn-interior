# TripoSR review view·좌표·품질 평가 보강

- 계약: worker는 전처리 이미지와 4개 회전 뷰를 hash와 함께 quarantine에 저장하고, TripoSR 좌표를 Three.js 좌표로 변환하며, 공식 치수 축 보정비 2배 이내·IoU 0.75 이상인 결과만 사람 검수 단계로 보낸다.
- 테스트: `workers/triposr-worker/tests/test_worker_math.py`, `src/application/productMeshApproval.test.ts`, `src/application/generatedMeshReview.test.ts`, `src/infrastructure/generated-mesh/HttpGeneratedMeshWorker.test.ts`, `src/infrastructure/generated-mesh/OfflineGeneratedMeshAdapters.test.ts`, `src/presentation/scene/generatedMeshFit.test.ts`, `src/presentation/scene/ProductVisual.test.tsx`

## RED

- 명령: `npx vitest run src/application/productMeshApproval.test.ts`
- 실패: quarantine에 없는 view hash가 사람 검수 증거로 통과해 1개 실패, 2개 통과.
- 명령: `npx vitest run src/infrastructure/generated-mesh/HttpGeneratedMeshWorker.test.ts`
- 실패: worker review PNG를 응답 DTO로 매핑하지 않아 1개 실패, 1개 통과.
- 명령: `docker run --rm interior3d-triposr-worker:107cefdc244c python -m unittest discover -s /service/tests -v`
- 실패: Z-up→Y-up 변환과 배경/위치/스케일 정규화 IoU가 스텁이어서 2개 실패, 1개 통과.
- 명령: `npx vitest run src/presentation/scene/generatedMeshFit.test.ts`
- 실패: 공식 envelope 축별 fitting 스텁으로 1개 실패, 2개 통과.
- 명령: `npx vitest run src/presentation/scene/ProductVisual.test.tsx`
- 실패: 승인 GLB가 uniform scale을 사용해 depth 300 대신 250으로 남아 1개 실패, 1개 통과.
- 명령: `npx vitest run src/application/generatedMeshReview.test.ts`
- 실패: review 준비도 스텁으로 2개 실패.

## GREEN

- 실제 quarantine view hash만 publish review에 허용: 4개 approval 테스트 통과.
- HTTP worker review PNG 매핑: 2개 통과.
- Python worker 수학: 3개 통과.
- exact official envelope fitting: 3개 통과.
- ProductVisual 축별 scale·provenance: 2개 통과.
- review 준비도: 2개 통과.
- 실제 KIVIK 3차 생성: IoU `0.923`, 축 보정비 `1.915×`, 58,532 triangles, 5개 review 이미지 저장. 당시 임시 `2×` 축 보정 기준에서는 사람 검수 가능으로 분류했다.

## REFACTOR

- 앱에 표시되는 승인 메시만 공식 W/D/H로 축별 fitting하고, 사용자 제공 미검증 GLB는 기존 uniform contain fitting을 유지한다.
- `mesh:review`가 로컬 HTML과 기본 `rejected` review template을 만든다.
- 전체 검증: `npm run verify` 통과(55개 파일·239개 단위 테스트, statements 82.09%, branches 73.25%, functions 81.71%, lines 85.07%), Python worker 3개 통과, production preview 8개 무재시도 통과, 서비스 health ready.
- 후속 교정: 하이브리드 계획의 공식 비율 오차 `5%` 계약을 적용하자 KIVIK 후보의 W/H·D/H 최대 오차는 `52.1%`로 확인돼 자동 게이트 실패로 변경됐다. 자세한 RED/GREEN은 `2026-08-28-generated-mesh-dimension-ratio-gate.md`에 기록한다.
- 미확인: 사람은 아직 승인 결정을 내리지 않았고 IKEA commercial permission도 없으므로 published manifest는 비어 있다.
