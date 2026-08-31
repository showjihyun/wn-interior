# 근거 기반 2D 도면 검수

- 계약: 모든 CV 초안은 원본과 연결된 대표 벽·방·문·실측 치수 하나를 선택하고 `수정 완료` 또는 `수정 불필요`와 근거를 저장하기 전까지 3D로 진입할 수 없다. `수정 완료`는 선택한 대표 요소의 fingerprint가 실제로 바뀐 경우에만 인정하고, 완료 근거는 프로젝트 저장·재열기 후에도 보존한다.
- 테스트: `src/domain/floorPlanReview.test.ts`, `src/presentation/state/store.test.ts`, `e2e/cv.spec.ts`

## RED

- 단위 명령: `npx vitest run src/presentation/state/store.test.ts`
- 종료 코드: `1`
- 의도한 실패 3건:
  - 근거 없이 완료해도 `pending`이 `completed`로 바뀌었다.
  - 실제 도면 변경 없이 `수정 완료`를 제출해도 완료됐다.
  - `수정 불필요`의 대표 요소·판정·근거가 완료 기록에 저장되지 않았다.
- 브라우저 명령: `npx playwright test e2e/cv.spec.ts -g "CV 초안은 대표 요소" --retries=0`
- 종료 코드: `1`
- 실패 이유: 기존 UI에는 `검수 근거 저장하고 3D 보기`와 대표 요소 입력이 없고 네 체크박스만 있었다.

## GREEN

- 단위 명령: RED와 동일.
- 결과: 22개 테스트 통과, 종료 코드 `0`.
- 대상 브라우저 명령: `npx playwright test e2e/cv.spec.ts -g "근거 있는 2D|CV 초안은 대표 요소" --retries=0`
- 결과: 실측·추정 축척 두 경로 2개 통과, 종료 코드 `0`.
- CV 브라우저 회귀: `npx playwright test e2e/cv.spec.ts --workers=1 --retries=0` — 9개 통과.

## REFACTOR

- 변경:
  - 도면·대표 요소별 fingerprint, 대표 요소 라벨, 근거 유효성, 3D 잠금 판정을 순수 도메인 규칙으로 분리했다.
  - CV 적용 시 초기 fingerprint를 저장하고, 완료 시 대표 요소·판정·근거·현재 fingerprint·시각을 프로젝트에 기록한다.
  - 기존 네 체크박스를 대표 요소 선택, 판정 라디오, 근거 입력으로 교체하고 선택 요소를 원본 오버레이 위에서 강조한다.
  - 실측 축척도 CV 초안인 이상 동일한 검수 게이트를 적용한다.
  - 과거 프로젝트의 근거 없는 `completed` 값은 완료로 간주하지 않는다.
- 통합 검증: `npm run verify` — 계약 77개 파일, 단위 67개 파일·299개 테스트, 커버리지·타입·lint·format·build·bundle budget 통과.
- 전체 브라우저: `npm run test:e2e -- --retries=0` — 72개 통과, 외부 AI 2개 조건부 skip.
- production preview: `npm run test:preview -- --retries=0` — 14개 통과.
- 실브라우저: Chromium 1280×800에서 한국 33평 도면으로 대표 벽 강조, `수정 불필요` 근거 저장, 완료 요약을 확인했다. 콘솔 오류·경고 0건. 로컬 증거는 `output/playwright/m30-review-evidence.png`, `output/playwright/m30-review-completed.png`이다.
- 미확인/skip: 실제 사용자가 대표 요소와 `수정 불필요`의 의미를 올바르게 이해하는지는 M23 실제 사용자 세션 전까지 미확인이다. 외부 AI 2개는 환경 조건부 skip이며 이 기능 판정에는 영향이 없다.
