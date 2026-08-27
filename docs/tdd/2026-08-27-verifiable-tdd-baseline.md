# 검증 가능한 TDD 기준선 도입

- 계약: 표준 명령으로 커버리지와 production preview를 재현할 수 있고, FOCSA 그리드가 품질 기준 없이 통과하지 않아야 한다.
- 테스트: `package.json`, `vite.config.ts`, `playwright*.config.ts`, `e2e/grid-focsa.spec.ts`

## RED

- 명령: `npm run test:coverage`
- 종료 코드: `1`
- 실패 이유: `Missing script: "test:coverage"`
- 명령: `npm run test:preview`
- 종료 코드: `1`
- 실패 이유: `Missing script: "test:preview"`
- 정적 확인: `e2e/grid-focsa.spec.ts`의 `expect(` 호출 수가 `0`이었다.

## GREEN

- 명령: `npm run test:coverage`
- 결과: 종료 코드 `0`, Vitest `18 files / 129 tests` 통과. 전체 statements `40.39%`, engine statements `82.45%`, store statements `42.12%`로 설정한 하한을 통과했다.
- 명령: `npm run test:preview`
- 결과: 종료 코드 `0`, production build 성공 후 `vite preview` 대상 `2 tests` 통과.
- 명령: `npx playwright test e2e/grid-focsa.spec.ts`
- 결과: 종료 코드 `0`, 16개 조합·양의 축척·최소 기준 충족 조합 존재 assertion 통과.
- 명령: `npm run test:contracts`
- 결과: 종료 코드 `0`, 테스트 파일 25개의 assertion 부재·`.only`·허위 RED 표식 검사 통과.

## REFACTOR

- 변경: 표준 검증 스크립트, 커버리지 하한, dev/preview 테스트 분리, 테스트 계약 검사, 실제 WebGL 픽셀 특성화 검사, CI와 작업 규약을 한 흐름으로 연결했다.
- 전체 검증: `npm run verify:full` 종료 코드 `0`. lint, format, coverage, build, E2E `44 passed`, production preview `2 passed`.
- 미확인/skip: 외부 API 키가 없어 실제 OpenRouter E2E `2 skipped`. 로컬 결정론 테스트와 별개로 실제 AI 사용자 결과는 미확인이다.
