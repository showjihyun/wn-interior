# KIVIK 전용 파라메트릭 소파 TDD 기록

- 계약: KIVIK 기본 폴백은 공식 2280×950×830mm envelope와 좌석폭 1800mm·깊이 600mm·높이 450mm를 사용하고, 낮은 팔걸이와 좌방석·등쿠션 각 2개를 렌더한다.
- 테스트: `src/presentation/scene/kivikSofaProfile.test.ts`, `src/infrastructure/reference-data/data/brandCatalog.test.ts`, `e2e/retail-shapes.spec.ts`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/presentation/scene/kivikSofaProfile.test.ts src/infrastructure/reference-data/data/brandCatalog.test.ts`
- 종료 코드: 1
- 결과: 2개 파일에서 3개 테스트 실패.
- 실패 이유: 프로필 stub에 좌석·쿠션·부품이 없었고 카탈로그가 범용 `sofa3`를 사용했다.

## GREEN

- 명령: RED와 동일
- 결과: 2개 파일, 19개 테스트 통과, 종료 코드 0.
- 구현:
  - 공식 좌석 치수를 전체 치수 비율로 스케일하는 순수 프로필
  - 프레임 1, 등판 1, 팔걸이 2, 좌방석 2, 등쿠션 2, 발 4의 총 12부품
  - 공식 envelope 및 작은 사용자 치수의 양수·유한성 계약
  - DIMMA 로컬 참고 GLB의 전체 비율 오차 3.06% 교차검증

## REFACTOR

- 대상 E2E: KIVIK 전용 형상 1개 통과. 개발 로컬 검수 GLB를 의도적으로 실패시켜 공식 사진+파라메트릭 폴백을 검증했다.
- production preview: IKEA 실상품 이미지·KIVIK 형상 테스트 1개 통과.
- 시각 검증: `output/playwright/kivik-parametric-production.png`에서 production의 공식 사진, 공식 좌석 치수와 실제 축척 배치를 확인했다.
- 전체 검증:
  - `npm run verify`: 통과. Vitest 64개 파일, 280개 테스트 통과. Statements 82.62%, Branches 72.34%, Functions 81.52%, Lines 85.36%.
  - `npm run test:e2e -- --retries=0`: 67개 통과, 외부 OpenRouter 의존 2개 skip.
  - `npm run test:preview -- --retries=0`: production preview 14개 통과.
- 미확인/skip: DIMMA 세부 메시·재질은 배포하거나 런타임에서 사용하지 않는다.
