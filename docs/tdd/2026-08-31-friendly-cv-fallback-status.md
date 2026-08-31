# CV 폴백 사용자 안내와 진단 상세 분리

- 계약: 로컬 CNN을 사용할 수 없어 고전 CV로 정상 복구한 경우 사용자 상태에는 기본 분석 성공만 표시한다. `unavailable`, abort 원인과 같은 내부 실패 상세는 고급 설정의 접힌 진단에서만 제공한다.
- 테스트: `src/application/createFloorPlanPreview.test.ts`, `e2e/cv.spec.ts`

## RED

- 단위 명령: `npx vitest run src/application/createFloorPlanPreview.test.ts`
- 종료 코드: `1`
- 실패 이유: 사용자용 `sourceLabel`이 `CNN 실패(offline) → 고전 CV`였고 별도 `diagnosticLabel`이 없었다.
- 브라우저 명령: `npx playwright test e2e/cv.spec.ts -g "로컬 CNN 실패는"`
- 종료 코드: `1`
- 실패 이유: 결정론적 HTTP 503에서 상태줄에 `CNN 실패(unavailable) → 고전 CV`가 그대로 표시됐다.

## GREEN

- 단위 명령: RED와 동일.
- 결과: 3개 테스트 통과. 사용자 label에는 내부 오류가 없고 진단 label에만 `CNN 실패(offline)`이 보존됐다.
- 브라우저 명령: RED와 동일.
- 결과: 사용자 친화적 기본 분석 안내, 상태줄 내부 오류 미노출, 접힌 진단 상세 확인 1개 테스트 통과.

## REFACTOR

- 변경: `FloorPlanPreviewResult`를 사용자용 `sourceLabel`과 선택적 `diagnosticLabel`로 분리하고, 모달은 새 분석을 시작할 때 이전 진단을 제거한다.
- 통합 기준선: `npm run verify` — 계약·타입·lint·format·288개 테스트·build·bundle budget 통과.
- 전체 브라우저: `npm run test:e2e` — 71개 통과·외부 AI 2개 조건부 skip.
- production preview: `npm run test:preview` — 14개 통과.
- 미확인/skip: 실제 사용자가 안내를 오류가 아닌 정상 폴백으로 이해하는지는 실제 참여자 검증이 없어 미확인이다.
