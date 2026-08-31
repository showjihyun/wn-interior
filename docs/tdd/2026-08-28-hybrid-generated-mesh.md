# 실측 데이터 + 검수 생성 메시 하이브리드

- 계약: 생성 메시가 공식 출처·권리·치수 비율·시각 품질·사람 검수·GLB 무결성을 모두 통과한 경우에만 시각화에 사용되며, 그 외 모든 상태에서는 공식 실측 형상과 상품 이미지로 안전하게 복구된다.
- 테스트: `src/domain/authoritativePlacementGeometry.test.ts`, `src/domain/engine/drop.test.ts`, `src/application/productMeshApproval.test.ts`, `src/application/productVisual.test.ts`, `src/infrastructure/generated-mesh/glbValidation.test.ts`, `src/infrastructure/generated-mesh/StaticApprovedMeshCatalog.test.ts`, `src/presentation/scene/generatedMeshFit.test.ts`, `src/presentation/scene/ProductVisual.test.tsx`, `e2e/retail-texture.spec.ts`

## RED

- 명령: `npx vitest run src/domain/authoritativePlacementGeometry.test.ts src/domain/engine/drop.test.ts src/application/productMeshApproval.test.ts src/application/productVisual.test.ts src/infrastructure/generated-mesh/glbValidation.test.ts`
- 종료 코드: `1`
- 실패 이유: 최소 컴파일 가능한 스텁에서 공식/override 치수 병합, 다른 배치 override 충돌, 메시 승인·거절 사유, 승인 우선/데칼 폴백, GLB 2.0·외부 URI 검사가 구현되지 않아 5개 파일에서 11개 계약 테스트가 의도대로 실패했다.
- 명령: `npx vitest run src/infrastructure/generated-mesh/StaticApprovedMeshCatalog.test.ts src/presentation/scene/generatedMeshFit.test.ts src/presentation/scene/ProductVisual.test.tsx`
- 종료 코드: `1`
- 실패 이유: manifest가 항상 빈 목록을 반환하고, 메시 fitting이 `null`이며, 렌더 오류 경계가 자식 오류를 복구하지 않아 3개 파일에서 4개 테스트가 의도대로 실패했다.

## GREEN

- 명령: RED의 첫 번째 명령과 동일
- 결과: 5개 파일, 16개 테스트 통과, 종료 코드 0.
- 명령: RED의 두 번째 명령과 동일
- 결과: 3개 파일, 5개 테스트 통과, 종료 코드 0.
- 자산 계약: `npm run test:mesh-assets` — 승인 생성 메시 0개, 빈 초기 manifest와 orphan GLB 검증 통과.
- 브라우저: `npx playwright test e2e/retail-texture.spec.ts` — 1개 통과. 현재 IKEA 상품이 `공식 사진 기반 3D`로 표시되고 배치 후 텍스처와 WebGL 픽셀 결과가 유지됨.
- 특성화 테스트: 첫 `npm run verify`에서 새 렌더 경로가 기존 `ProductImageDecal`의 미검증 분기를 커버리지 그래프에 드러내 texture threshold가 실패했다. 기준을 낮추지 않고 `ProductImageDecal.test.tsx`로 appearance 없음·비동기 texture 준비·unmount release를 고정했다. 실제 Three.js 장면 객체로 승인 GLB의 contain fit·바닥 정렬·provenance도 검증했으며 최종 단위 테스트는 50개 파일·223개다.

## REFACTOR

- 변경: 생성 자산을 Product/Project/Undo 밖의 `ApprovedProductMeshCatalog`로 분리하고, `resolveAuthoritativePlacementGeometry`로 공식/override 물리 치수를 중앙화했다.
- 변경: 생성 메시를 official envelope에 uniform contain fit하고 ErrorBoundary+Suspense가 항상 `Shape + ProductImageDecal` 폴백을 유지한다.
- 전체 검증: `npm run verify:full` — 전체 E2E 58개 통과·외부 AI 2개 skip, production preview 4개 통과. 마지막 fitting 정리 후 `npm run verify`와 대상 테스트를 다시 통과했다.
- preview 안정화: 이후 반복 preview에서 이미지 `naturalWidth`를 로드 전에 읽어 첫 시도가 실패하고 retry가 통과하는 기존 flake를 관찰했다. `expect.poll`로 실제 디코딩 완료를 기다리게 수정하고 `npm run test:preview -- --retries=0`으로 재검증한다.
- 미확인/skip: 실제 AI 생성 GLB는 0개다. 입력 이미지 파생물 사용 권리와 지원 GPU가 확보되기 전에는 승인 자산을 가장해 게시하지 않는다.
