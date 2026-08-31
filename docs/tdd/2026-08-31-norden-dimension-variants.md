# NORDEN 접힘·기본·완전확장 치수 variant

- 계약: 사용자는 인스펙터에서 NORDEN의 공식 접힘 260mm, 기본 890mm, 완전확장 1520mm 상태를 선택한다. 선택 결과는 `dimsOverride`로 저장되어 시각 형상·선택 bounds·충돌·Undo/Redo·프로젝트 저장 경로가 동일한 공식 치수를 사용한다.
- 테스트: `src/application/productDimensionVariants.test.ts`, `src/presentation/scene/gatelegTableProfile.test.ts`, `src/infrastructure/reference-data/data/brandCatalog.test.ts`, `e2e/retail-shapes.spec.ts`

## RED

- 명령: `npx vitest run src/application/productDimensionVariants.test.ts src/presentation/scene/gatelegTableProfile.test.ts src/infrastructure/reference-data/data/brandCatalog.test.ts`
- 종료 코드: `1`
- 실패: active variant와 placement patch가 항상 undefined/null이었고, 접힘 형상에도 펼친 날개 1개가 남았으며 카탈로그 variant가 로드되지 않았다. 4개 실패, 11개 통과.

## GREEN

- 명령: `npx tsc --noEmit; npx vitest run src/application/productDimensionVariants.test.ts src/presentation/scene/gatelegTableProfile.test.ts src/infrastructure/reference-data/data/brandCatalog.test.ts src/application/projectEditing.test.ts src/application/projectService.test.ts`
- 결과: 타입 검사와 23개 테스트 통과, 종료 코드 `0`.
- 구현: 일반화된 `Product.dimensionVariants`, 브랜드 JSON 검증·복사, active 상태 탐지와 placement patch를 추가했다. 기본 상태는 override를 제거하고 접힘·확장은 공식 치수 복사본을 기록한다.

## REFACTOR

- UI: 인스펙터에 `접힘 26cm`, `기본 89cm`, `완전확장 152cm` 버튼과 active 상태를 추가했다.
- 형상: 접힘은 펼친 날개 0/접힌 날개 2, 기본은 1/1, 완전확장은 2/0이다. 각 상태의 scene bounds는 해당 공식 footprint 안에 유지된다.
- E2E: 세 버튼, `dimsOverride`, 상태별 날개 수, Undo, 기본 상태 복귀를 실제 브라우저에서 검증했다. 접힘·확장 캡처는 `output/playwright/norden-variant-collapsed.png`, `norden-variant-expanded.png`이다.
- 저장 특성화: `projectDocument.test.ts`에서 완전확장 `dimsOverride`의 export/import 왕복 보존을 확인했다.
- 전체 검증: `npm run verify` 통과(60개 파일·262개 단위 테스트, statements 82.48%, branches 73.19%, functions 81.37%, lines 85.30%). `npm run test:preview -- --retries=0` 11개 통과. `npm run test:e2e -- --retries=0`은 외부 API 키가 필요한 2개를 명시적으로 skip하고 63개를 통과했다.
- 미확인: 날개 전환 애니메이션은 없다. 상태 변경은 즉시 적용되며 공간 계획 정확성을 우선한다.
