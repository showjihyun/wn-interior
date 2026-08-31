# 2D SVG 도면 요소 접근성과 히트 영역

- 계약: 2D 검수의 벽·방·문은 접근 가능한 이름과 버튼 역할을 갖고, 선택 도구에서 Enter·Space로 대표 검수 요소를 선택해야 한다. 문은 벽 안의 얇은 본체뿐 아니라 문짝 회전 호를 포함한 시각 범위에서 포인터 선택을 받아야 하며, 그리기 도구 중에는 탭 순서에서 빠져야 한다.
- 테스트: `e2e/cv.spec.ts`

## RED

- 명령: `npx playwright test e2e/cv.spec.ts -g "2D 검수 요소는 키보드와 문 스윙 히트 영역으로 선택한다" --retries=0`
- 종료 코드: `1`
- 실패 이유: `.ed2d-svg [role="button"][aria-label^="벽 "]` 요소가 없어 첫 벽의 `tabindex="0"` 단언에서 실패했다. 기존 SVG 벽·방·문에는 버튼 역할·접근 이름·키보드 활성화 경로가 없었다.

## GREEN

- 명령: RED와 동일.
- 결과: `1 passed`, 종료 코드 `0`.
- 검증 범위: 벽 Enter, 방 Space, 문 Space 선택과 검수 콤보박스 동기화, 문 그룹 전체 경계 중앙 포인터 클릭, 벽 그리기 중 `tabindex="-1"`.

## REFACTOR

- 변경:
  - SVG 요소 활성화를 `activateSvgTarget`/`targetKeyDown`으로 통합해 포인터·Enter·Space가 같은 선택 경로를 사용한다.
  - 벽은 최소 320mm 투명 선, 문은 본체·문짝 회전 호를 덮는 투명 사각형을 히트 영역으로 사용한다.
  - 키보드 포커스는 파란 외곽선으로 표시하고, 방은 CV 검수 중에만 활성 버튼으로 노출한다.
- 실브라우저: Playwright CLI의 1024×768 Chromium에서 접근성 트리의 벽·방·문 이름과 Tab 포커스 파란 외곽선을 확인했고 콘솔 오류·경고는 0건이었다. 로컬 캡처는 `output/playwright/svg-a11y-cli-2026-08-31/` 경로에 두었다.
- 전체 검증: `npm run verify:full` — 계약 79개 파일, 단위 69개 파일·308개, E2E 74개, production preview 14개 통과. 타입·lint·format·build·번들 예산 통과.
- 미확인/skip: 외부 OpenRouter AI 2개는 기존 환경 조건부 skip로 이번 SVG 변경과 무관하다. 실제 키보드·보조기술 사용자 검증은 M23에서 수행한다.
