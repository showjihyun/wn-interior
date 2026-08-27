# 평면도 업로드 핵심 여정 재구성

- 계약: 사용자는 평면도 업로드 진입점을 바로 찾고, 실측값 또는 명시적 추정 축척 확인 후에만 적용하며, 적용 후 2D 보정과 3D 보기 중 하나를 선택할 수 있어야 한다.
- 테스트: `src/engine/planReview.test.ts`, `e2e/cv.spec.ts`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/engine/planReview.test.ts`
- 종료 코드: `1`
- 실패 이유: 축척 폭·보정 상태·검토 문제 구현 전이라 계약 7건 모두 실패.
- 명령: `npx playwright test e2e/cv.spec.ts --grep "평면도 업로드"`
- 종료 코드: `1`
- 실패 이유: `평면도 업로드 → 3D` 진입점과 축척 게이트·완료 선택 화면이 없음.
- 명령: `npx playwright test e2e/cv.spec.ts --grep "CV 엔진이"`
- 종료 코드: `1`
- 실패 이유: 변환 후 `변환 초안 검수` 안내가 없음.
- 명령: `npx playwright test --config=playwright.preview.config.ts --grep "비상업 도면 모델"`
- 종료 코드: `1`
- 실패 이유: production 모달에 비상업 모델 비활성 상태가 보이지 않음.
- 명령: `npx vitest run src/engine/planReview.test.ts --testNamePattern "축척 보정 후 문·창문 보존"`
- 종료 코드: `1`
- 실패 이유: 11,800mm 보정 뒤 문 폭이 상한을 넘으면 검출된 문 7개가 적용 단계에서 모두 삭제되는 실브라우저 버그를 재현.

## GREEN

- 단위 계약: 축척·검토·개구부 보존 `11 passed`.
- 업로드·축척·완료 선택 E2E: `1 passed`.
- 기존 CV 변환·2D 검수 안내 E2E: `1 passed`.
- 한국 실도면 큰 축척 보정 뒤 문 보존 E2E: `1 passed`.
- production 비상업 모델 안내: `1 passed`.

## REFACTOR

- 변경: 업로드 CTA를 모드 전환 옆 핵심 행동으로 이동하고, 모달을 업로드·축척·검출 검토 3단계로 정리했다. 고급·연구 옵션은 접고 변환 초안 검수 안내를 2D 화면에 유지한다.
- 실브라우저: 1366×900과 1024×768에서 한국 33평 도면을 두 차례 변환. 벽 25개·방 6개·문 7개와 11,800mm 축척, 완료 선택, 3D 렌더, 2D 검수 안내 확인.
- 전체 검증: `npm run verify:full` 종료 코드 `0`. 단위 `140 passed`, E2E `46 passed / 2 skipped`, production preview `3 passed`, lint·format·coverage·build 통과.
- 미확인/skip: 대상 사용자 3~5명 관찰 세션은 외부 참여자 모집이 필요해 미실행.
