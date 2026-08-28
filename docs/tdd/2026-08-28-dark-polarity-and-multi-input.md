# 어두운 배경 극성 복구와 복수 평면 입력 차단

- 계약: 어두운 배경·색상 면 도면은 밝은 벽선만 구조 잉크로 분리하고, 한 이미지의 여러 독립 평면 영역은 하나의 프로젝트로 합치지 않고 적용을 차단해야 한다.
- 테스트: `src/engine/planInput.test.ts`, `e2e/cv.spec.ts`, `e2e/cv-benchmark.spec.ts`

## RED

- 명령: `npx vitest run src/engine/planInput.test.ts`
- 종료 코드: `1`
- 실패 이유: 극성 판정·평면 영역 함수의 초기 stub으로 합성 계약 4건 실패.
- 명령: `npx vitest run src/engine/planInput.test.ts --testNamePattern "실제 복수|실제 단일"`
- 종료 코드: `1`
- 실패 이유: 단순 연결요소 방식이 Paris를 놓치고 Harris·State House를 복수 도면으로 오탐.
- 명령: `npx playwright test e2e/cv.spec.ts --grep "어두운 배경 색상"`
- 종료 코드: `1`
- 실패 이유: 실제 어두운 도면이 `19벽/0방/0문`으로 남고 자동 반전 상태가 표시되지 않음.
- 명령: `npx playwright test e2e/cv.spec.ts --grep "복수 평면 입력"`
- 종료 코드: `1`
- 실패 이유: 복수 입력 경고가 없고 Somerville을 하나의 프로젝트로 변환함.

## GREEN

- 어두운 배경:
  - 외곽 4% 밴드의 어두운 픽셀 비율로 밝은 선/어두운 배경 극성을 판정한다.
  - 밝은 픽셀 상위 클래스에 2차 Otsu를 적용해 검정 배경과 갈색 채움을 제거한다.
  - 실제 Apartment fixture가 `16벽/7방/4개구부`로 복구됐다.
- 복수 입력:
  - 정리된 벽선의 x/y 지지 구간과 plan-like slab을 검증한다.
  - Somerville 4영역, Paris 2영역을 감지한다.
  - Harris·State House·Bungalow·Space를 단일 입력으로 유지한다.
  - UI에서 Apply를 막고 한 층 또는 한 세대만 잘라 다시 업로드하도록 안내한다.
- 명령: `npx vitest run src/engine/planInput.test.ts`
- 결과: `13 passed`
- 명령: `npx playwright test e2e/cv-benchmark.spec.ts`
- 결과: `12 passed`, 단일 변환 `7/8`, 복수 감지 `2/2`, 안전 처리 `9/10`.

## REFACTOR

- 일반 흰 배경 도면은 기존 Otsu 이진화 결과를 유지한다.
- 복수 영역 검사는 CNN·Raster2Seq 요청 전에 실행해 불필요한 추론을 시작하지 않는다.
- 실패 중인 Space Apartment는 복수 입력이 아니라 두꺼운 밴드가 축척 p90을 오염시키는 단일 복잡 도면으로 재분류했다.
- 전체 검증: `npm run verify:full` 종료 코드 `0`. 단위 `153 passed`, E2E `57 passed / 2 skipped`, production preview `3 passed`, lint·format·coverage·build 통과.
