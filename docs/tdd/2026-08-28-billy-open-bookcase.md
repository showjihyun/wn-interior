# IKEA BILLY 열린 책장·현재 SKU 교정

- 계약: BILLY는 단순 박스가 아니라 공식 800×280×2020mm envelope 안의 열린 책장으로 렌더한다. 고정 선반 1개와 조절식 선반 4개를 합쳐 내부 선반 5개를 표시하고 현재 SKU `005.220.47`, 89,900원, 공식 링크를 사용한다.
- 근거: <https://www.ikea.com/kr/ko/p/billy-bookcase-white-00522047/>
- 테스트: `src/presentation/scene/openBookcaseProfile.test.ts`, `src/infrastructure/reference-data/data/brandCatalog.test.ts`, `e2e/retail-shapes.spec.ts`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/presentation/scene/openBookcaseProfile.test.ts src/infrastructure/reference-data/data/brandCatalog.test.ts`
- 종료 코드: `1`
- 실패: profile이 선반 0개·부품 0개를 반환했고 카탈로그는 오래된 SKU `002.638.38`, 단순 `box`, 구조화되지 않은 이전 가격을 유지했다. 3개 실패, 8개 통과.

## GREEN

- 명령: `npx tsc --noEmit; npx vitest run src/presentation/scene/openBookcaseProfile.test.ts src/infrastructure/reference-data/data/brandCatalog.test.ts`
- 결과: 타입 검사와 11개 테스트 통과, 종료 코드 `0`.
- 구현: 좌우 측판·상하판·뒷판·내부 선반 5개가 모두 양수 판재이며 전체 bounds가 공식 envelope와 일치하도록 `openBookcase` profile을 추가했다. BILLY 데이터는 현재 SKU·가격·구성 기준으로 갱신했다.

## REFACTOR

- 브라우저: 동일 800×280×2020mm 위치·카메라에서 막힌 직육면체가 6개 수납칸의 열린 책장으로 교체됐다. 전후 캡처는 `output/playwright/billy-shape-baseline.png`, `billy-shape-improved.png`이다.
- E2E: 카탈로그 SKU·가격, scene 선반 수, Box mesh 10개, 정확한 W/D/H bounds, 공식 product dims와 WebGL context를 검증한다.
- 전체 검증: `npm run verify` 통과(58개 파일·254개 단위 테스트, statements 82.32%, branches 73.18%, functions 81.90%, lines 85.22%). `npm run test:preview -- --retries=0` 10개 통과. `npm run test:e2e -- --retries=0`은 외부 API 키가 필요한 2개를 명시적으로 skip하고 62개를 통과했다.
- 미확인: 공식 상품 이미지는 재배포 권리를 확인하지 않아 추가하지 않았다. 선반 높이는 사용자가 조절할 수 있는 실제 제품을 대표하는 균등 기본 배치다.
