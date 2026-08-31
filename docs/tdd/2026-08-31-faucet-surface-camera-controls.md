# IKEA 수전 상판 배치와 3D 화면 조작

- 계약: IKEA ALMAREN 수전은 METOD 하부장 또는 KILSVIKEN 싱크 영역을 클릭했을 때만 상판 뒤쪽에 배치되고 받침 배치 ID·설치 높이를 저장해야 한다. 3D 화면은 선택 제품 15도 회전과 OrbitControls 목표 기준 확대·축소 UI를 제공해야 한다.
- 테스트: `src/presentation/state/store.test.ts`, `src/presentation/scene/SceneSurfaceRegistry.test.ts`, `e2e/app.spec.ts`, `e2e/retail-texture.spec.ts`

## RED

- 단위 명령: `npx vitest run src/presentation/state/store.test.ts src/presentation/scene/SceneSurfaceRegistry.test.ts`
- 종료 코드: `1`
- 실패 2건:
  - 싱크대가 없는 거실 바닥에도 수전 ID가 생성됐다.
  - `SceneSurfaceRegistry.zoomIn` 함수가 없어 `TypeError`가 발생했다.
- 브라우저 명령: `npx playwright test e2e/app.spec.ts -g "IKEA 수전을 싱크대에 배치한 뒤 UI로 회전·확대·축소한다" --retries=0`
- 종료 코드: `1`
- 실패 이유: `선택 제품 15도 회전` 버튼이 없어 첫 UI 단언에서 실패했다.

## GREEN

- 단위: RED와 동일한 명령에서 2개 파일·24개 테스트 통과.
- 브라우저: RED와 동일한 명령에서 1개 통과. `IKEA 필터 → ALMAREN 카드 → METOD 상판 클릭 → 회전 → 확대/축소`를 실제 UI로 수행했다.
- 관련 단위 6개 파일·51개와 실상품 사진 투영 회귀 1개가 통과했다.

## REFACTOR

- `surface` mount와 회전된 받침 footprint 탐색·뒤쪽 상판 정렬·설치 높이 계산을 domain 순수 모듈로 분리했다.
- METOD의 `수전 별도` 상품 데이터를 따라 형상에 내장됐던 가상 수도꼭지를 제거해 ALMAREN과 중복 렌더되지 않게 했다.
- 줌은 목표점과의 거리를 0.8/1.25배로 조정하고 OrbitControls의 1,200~45,000mm 범위를 유지한다.
- 실브라우저: 상판 높이 800mm, 수전 15도 회전, 화면 조작 버튼과 확대 결과를 확인했고 콘솔 오류·경고는 0건이었다. 캡처는 `output/playwright/faucet-camera-ui-2026-08-31/` 경로에 두었다.
- 전체 검증: `npm run verify:full` — 계약 80개 파일, 단위 70개 파일·310개, E2E 76개, production preview 14개 통과. 외부 AI 2개는 기존 환경 조건부 skip.
