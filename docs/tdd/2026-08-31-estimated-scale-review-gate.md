# 추정 축척 2D 원본 검수 게이트

- 계약: 추정 축척으로 변환한 CV 프로젝트는 업로드 원본과 벽·방·문·실측 4개 항목을 2D에서 확인하기 전까지 모달·툴바·단축키 어느 경로로도 3D에 진입할 수 없다. 검수 완료 상태와 원본 정렬 정보는 현재 탭 프로젝트에 자동 저장되어 새로고침 후에도 유지된다.
- 테스트: `src/presentation/state/store.test.ts`, `e2e/cv.spec.ts`

## RED

- 단위 명령: `npx vitest run src/presentation/state/store.test.ts`
- 종료 코드: `1`
- 실패 2건:
  - pending 추정 축척 상태에서도 `setMode('3d')` 뒤 mode가 `3d`였다.
  - CV 프로젝트를 불러온 뒤 원본·검수 메타데이터가 `undefined`였다.
- 브라우저 명령: `npx playwright test e2e/cv.spec.ts -g "추정 축척은 원본"`
- 종료 코드: `1`
- 실패 이유: 추정 축척 적용 완료 화면의 `바로 3D 보기`가 활성 상태였다.

## GREEN

- 단위 명령: `npx vitest run src/presentation/state/store.test.ts src/application/projectService.test.ts src/application/projectDocument.test.ts`
- 결과: 3개 파일·25개 테스트 통과, 종료 코드 `0`.
- 브라우저 명령: RED와 동일.
- 결과: 모달 3D 차단, SVG 원본 오버레이, 툴바·단축키 차단, 4개 체크, 완료 후 3D, 새로고침 후 완료 상태 복구까지 1개 테스트 통과.

## REFACTOR

- 변경:
  - 처리 해상도의 업로드 원본을 압축 JPEG data URL과 `mmPerPx` 정렬 정보로 CV 프로젝트에 저장한다.
  - `floorPlanReview`를 project service·autosave·import/export 경계에 포함한다.
  - 스토어 `setMode`를 최종 게이트로 사용하고, 툴바는 pending 상태를 비활성화한다.
  - 2D 검수 패널에 원본 비교 토글과 벽·방·문·실측 체크리스트를 제공한다.
- 관련 브라우저: `npx playwright test e2e/cv.spec.ts --workers=1` — 7개 통과.
- 1024×768 검수 여정: 대상 E2E 1개 통과.
- 전체 단위: `npm run test:coverage` — 65개 파일·286개 테스트 통과.
- 전체 브라우저: `npm run test:e2e` — 69개 통과·외부 AI 2개 조건부 skip.
- production preview: `npm run test:preview` — 14개 통과.
- 통합 기준선: `npm run verify` — 계약·타입·lint·format·286개 테스트·build·bundle budget 통과.
- 미확인/skip: 실제 사용자의 원본 비교 이해도와 체크 신뢰성은 페르소나 사전 점검 이후에도 실제 사용자 근거가 없어 미확인이다.
