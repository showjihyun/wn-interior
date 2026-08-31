# 동일 배치안 중복 저장 경고

- 계약: 배치안 이름·썸네일·placement ID·배열 순서가 달라도 제품·좌표·회전·색상·설치 높이·치수 상태가 같으면 기존 배치안과 차이가 없는 것으로 판정해 저장하지 않는다. 실제 배치 속성이 달라지면 새 안으로 저장한다.
- 테스트: `src/application/placementVariants.test.ts`, `src/presentation/state/store.test.ts`, `e2e/app.spec.ts`

## RED

- 단위 명령: `npx vitest run src/presentation/state/store.test.ts`
- 종료 코드: `1`
- 실패 이유: 동일 상태를 `B안`으로 다시 저장한 결과가 `undefined`였고 variants가 두 개로 늘어났다.
- 브라우저 명령: `npx playwright test e2e/app.spec.ts -g "동일한 배치는"`
- 종료 코드: `1`
- 실패 이유: A안 저장 직후 변경 없이 B안을 저장해도 기존 안과 차이가 없다는 status가 없고 카드가 중복 생성됐다.

## GREEN

- 단위 명령: `npx vitest run src/application/placementVariants.test.ts src/presentation/state/store.test.ts`
- 결과: 2개 파일·22개 테스트 통과.
- 브라우저 명령: RED와 동일.
- 결과: 중복 경고·카드 1개 유지·회전 변경 후 카드 2개 저장까지 1개 테스트 통과.

## REFACTOR

- 변경: placement를 정규화된 JSON entry로 바꾸고 정렬해 fingerprint를 계산한다. 회전은 360도 동치로 정규화하고 비정상 숫자는 `null`로 안정화한다.
- 통합 기준선: `npm run verify` — 계약 76개 파일·타입·lint·format·66개 테스트 파일·292개 테스트·build·bundle budget 통과.
- 전체 브라우저: `npm run test:e2e` — 72개 통과·외부 AI 2개 조건부 skip.
- production preview: `npm run test:preview` — 14개 통과.
- 미확인/skip: 사람이 느끼는 “충분히 다른 배치”의 거리 임계값은 정의하지 않았다. 이번 계약은 정확히 동일한 상태만 중복으로 처리한다.
