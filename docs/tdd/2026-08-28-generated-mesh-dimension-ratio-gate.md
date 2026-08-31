# 생성 메시 공식 치수 비율 5% 게시 게이트

- 계약: 생성 메시의 W/H 또는 D/H 비율이 공식 상품 치수와 5% 넘게 다르면 로컬 원인 분석은 허용하되 사람 검수 가능·게시 가능 후보로 표시하거나 게시해서는 안 된다. 정확히 5%인 경계는 부동소수점 반올림 때문에 거절되지 않아야 한다.
- 테스트: `src/application/generatedMeshReview.test.ts`, `src/application/productMeshApproval.test.ts`, `e2e/local-mesh-review.spec.ts`

## RED

- 명령: `npx vitest run src/application/generatedMeshReview.test.ts src/application/productMeshApproval.test.ts`
- 종료 코드: `1`
- 실패: KIVIK 후보가 `maxDimensionRatioError`를 계산하지 않았고 축 보정비 1.915배를 게시 가능한 것으로 처리했다. 3개 실패, 4개 통과.
- 명령: `npx vitest run src/application/productMeshApproval.test.ts`
- 종료 코드: `1`
- 실패: 수학적으로 정확히 5%인 경계가 JavaScript 부동소수점에서 `0.050000000000000044`가 되어 `geometry-not-approved`로 잘못 거절됐다. 1개 실패, 4개 통과.
- 명령: `npx playwright test e2e/local-mesh-review.spec.ts --retries=0`
- 종료 코드: `1`
- 실패: 카드가 새 `로컬 생성 3D · 자동 게이트 실패` 상태를 표시하지 않고 기존 검수 대기 상태를 유지했다.

## GREEN

- 명령: `npx vitest run src/application/productMeshApproval.test.ts src/application/generatedMeshReview.test.ts`
- 결과: 8개 통과, 종료 코드 `0`.
- 명령: `npx playwright test e2e/local-mesh-review.spec.ts --retries=0`
- 결과: 실제 KIVIK GLB 배치·회전과 자동 게이트 실패 표시 1개 통과, 종료 코드 `0`.
- 구현: W/H·D/H 상대 오차의 최댓값을 계산하고 `5% + 1e-12` 경계로 게시 여부를 판정한다. KIVIK 최대 오차는 `52.1%`이며 `dimension-ratio-error-too-large`로 분류된다.

## REFACTOR

- 변경: 수치 계산을 DOM·파일시스템 의존성이 없는 application 순수 모듈로 분리했다. 개발 로더는 record fingerprint의 공식 치수 스냅샷과 GLB·검수 이미지 hash를 검증한 뒤 같은 판정을 UI에 전달한다.
- 수동 시각 검증: Playwright CLI 실제 Chromium에서 KIVIK 카드의 실패 배지와 `52.1%` tooltip을 확인했다. 캡처는 `output/playwright/kivik-auto-gate-failed.png`이다.
- 전체 검증: `npm run verify` 통과(55개 파일·242개 단위 테스트, statements 82.22%, branches 73.19%, functions 81.74%, lines 85.17%). production build·로컬 자산 비노출 번들 검사도 통과했다. `npm run test:preview -- --retries=0` 8개 통과. `npm run test:e2e -- --retries=0`은 외부 API 키가 필요한 2개를 명시적으로 skip하고 59개를 통과했다.
- 미확인: 단일 사진만으로 5% 비율 문턱을 만족하는 새 KIVIK 메시 생성은 아직 완료하지 않았다.
