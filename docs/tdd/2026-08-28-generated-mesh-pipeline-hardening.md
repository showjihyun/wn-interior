# 생성 메시 오프라인 파이프라인 보강

- 계약: generator output은 public에 직접 접근하지 못하며 실제 GLB 검사, 독립 권리 증거, 사람 검수, product fingerprint를 모두 통과한 PII 없는 published manifest만 런타임에서 사용된다. GLB·이미지 오류는 실측 형상을 보존한다.
- 테스트: `src/application/generatedMeshLifecycle.test.ts`, `src/application/productMeshApproval.test.ts`, `src/infrastructure/generated-mesh/StaticApprovedMeshCatalog.test.ts`, `src/infrastructure/generated-mesh/glbValidation.test.ts`, `src/infrastructure/generated-mesh/HttpGeneratedMeshWorker.test.ts`, `src/infrastructure/generated-mesh/OfflineGeneratedMeshAdapters.test.ts`, `src/presentation/scene/ProductVisualStatusRegistry.test.ts`, `src/presentation/texture/ProductImageDecal.test.tsx`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/application/generatedMeshLifecycle.test.ts src/presentation/scene/ProductVisualStatusRegistry.test.ts`
- 종료 코드: `1`
- 실패 이유: fingerprint·quarantine·독립 publish·상태 구독 스텁으로 4개 실패, 1개 통과.
- 명령: `npx vitest run src/infrastructure/generated-mesh/StaticApprovedMeshCatalog.test.ts`
- 종료 코드: `1`
- 실패 이유: 기존 v1 candidate manifest가 PII 없는 v2 published entry를 읽지 못해 1개 실패, 내부 필드 거절 1개 통과.
- 명령: `npx vitest run src/infrastructure/generated-mesh/glbValidation.test.ts`
- 종료 코드: `1`
- 실패 이유: 실제 POSITION/index binary inspection 스텁으로 2개 실패, 기존 컨테이너 2개 통과.
- 명령: `npx vitest run src/infrastructure/generated-mesh/HttpGeneratedMeshWorker.test.ts`
- 종료 코드: `1`
- 실패 이유: localhost multipart worker adapter 미구현으로 2개 실패.
- 명령: `npm run test:preview -- --retries=0`
- 종료 코드: `1`
- 실패 이유: test-mode 합성 상품과 published manifest가 조립되지 않아 GLBLoader 성공 E2E 1개 실패, 기존 4개 통과.
- 명령: `npx vitest run src/presentation/texture/ProductImageDecal.test.tsx`
- 종료 코드: `1`
- 실패 이유: texture 실패 callback이 없어 상위 상태 통지 테스트 1개 실패, 기존 2개 통과.
- 명령: `npm run test:bundle-budget`
- 종료 코드: `1`
- 실패 이유: 단일 entry가 1,262,907B로 400,000B 예산을 초과했다.

## GREEN

- lifecycle/status: 2개 파일·5개 통과.
- v2 published catalog: 1개 파일·2개 통과.
- 실제 GLB inspector: 1개 파일·4개 통과.
- HTTP worker: 1개 파일·2개 통과.
- texture 오류 통지: 1개 파일·3개 통과.
- production preview: 성공·404·손상 GLB·이미지 동시 실패를 포함해 8개 무재시도 통과.
- bundle: entry 145,892B, 최대 `vendor-three` 688,109B, 6개 chunk로 예산 통과.
- 특성화 테스트: 파일 이미지·quarantine 원자 기록 어댑터 2개 통과.
- lazy 3D 회귀: 전체 E2E에서 여러 UI 배치 테스트가 scene 등록 전에 클릭되어 실패한 것을 확인했다. app E2E 시작 계약을 canvas·scene 등록과 두 animation frame 완료로 고정하고, KIVIK은 pending product와 최종 placement까지 추가 poll하도록 입력 준비 경계를 동기화했다.

## REFACTOR

- candidate 내부의 self-approved rights/review를 제거하고 generation, quarantine, rights, review, published entry를 분리했다.
- 실제 판매상품 승인 자산은 여전히 0개이며 test-mode fixture는 production JSON·manifest·public 자산에 포함되지 않는다.
- 전체 검증: `npm run verify` 통과(54개 파일·234개 단위 테스트, bundle budget 포함), `npm run test:e2e -- --retries=0` 58개 통과·외부 AI 2개 skip, `npm run test:preview -- --retries=0` 8개 통과.
- 미확인/skip: 실제 TripoSR worker 서비스와 실제 권리 승인 상품은 아직 연결하지 않았다. HTTP/CLI 계약과 검역·게시 경로는 결정론적으로 검증했다.
