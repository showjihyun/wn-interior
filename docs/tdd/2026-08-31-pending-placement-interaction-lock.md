# 카탈로그 배치 대기 중 기존 오브젝트 잠금

- 계약: 좌측 카탈로그에서 새 제품을 선택하면 배치가 완료되거나 Esc로 취소할 때까지 기존 가구는 선택·드래그·hover 대상이 아니어야 한다. 현재 배치 제품과 Esc 취소 방법을 화면에 표시하고, 입력 요소에 포커스가 있어도 Esc 후에는 기존 오브젝트를 다시 선택할 수 있어야 한다.
- 테스트: `e2e/app.spec.ts`

## RED

- 명령: `npx playwright test e2e/app.spec.ts -g "카탈로그 배치 대기 중에는 기존 오브젝트를 잠그고 Esc 후 선택을 복구한다" --retries=0`
- 종료 코드: `1`
- 실패 이유: 홈바 테이블 배치 대기 중 기존 소파 위로 포인터를 옮기자 `document.body.style.cursor` 값이 `grab`이 되었다. 클릭 guard는 있었지만 hover 핸들러가 기존 오브젝트를 계속 상호작 대상으로 표시하고 배치 고스트의 포인터 추적을 가로막았다.

## GREEN

- 명령: RED와 동일.
- 결과: `1 passed`, 종료 코드 `0`.
- 반복: `--repeat-each=5 --retries=0` 조건에서 `5 passed`.
- 검증 범위: 기존 소파 hover·선택 잠금, pending 제품 보존, 카탈로그·상태바 배치 모드 표시, 슬라이더 포커스 상태의 Esc 취소, 취소 후 기존 소파 선택·인스펙터 복구.

## REFACTOR

- 변경:
  - `pendingProductId`가 있는 동안 배치된 가구 그룹의 pointer down/move/up/over/out 핸들러를 제거해 고스트 배치 평면으로 입력이 전달되게 했다.
  - pending 진입 즉시 남아 있는 hover·커서 상태를 정리한다.
  - 좌측 카탈로그 카드와 `role="status"` 상태바에 현재 배치 제품·위치 클릭·Esc 취소를 노출한다.
  - Escape 처리를 input/textarea/select 단축키 제외보다 앞에 두어 포커스 위치와 관계없이 배치 모드를 종료한다.
- 실브라우저: Playwright CLI Chromium에서 녹색 pending 카드와 `홈바 테이블 1200 배치 중 · Esc 취소` 상태바를 확인했다. 슬라이더에 포커스를 둔 채 Esc 후 일반 상태바로 복구됐고 콘솔 오류·경고는 0건이었다. 로컬 캡처는 `output/playwright/pending-placement-ux-2026-08-31/` 경로에 두었다.
- 전체 검증:
  - `npm run verify:full` — 계약 79개 파일, 단위 69개 파일·308개, build·bundle budget, production preview 14개 통과. 최초 병렬 E2E에서 Esc 직후 R3F 재연결 전 클릭한 테스트 1건이 retry 통과해 animation-frame 동기화를 추가했다.
  - 동기화 후 `npm run test:e2e -- --retries=0` — `75 passed`, 외부 AI `2 skipped`, flaky·retry 0건.
- 미확인/skip: OpenRouter 실서비스 2개는 기존 환경 조건부 skip로 이번 로컬 배치 상호작과 무관하다.
