# IKEA NORDEN 게이트레그 테이블·현재 SKU 교정

- 계약: NORDEN 자작나무 모델은 현재 SKU `804.238.83`, 399,000원과 공식 26/89/152×80×74cm 상태를 사용한다. 기본 배치는 890mm footprint 안에서 한쪽 날개를 펼치고 다른 날개를 접으며 중앙 수납부와 게이트 다리를 표시한다.
- 근거: <https://www.ikea.com/kr/ko/p/norden-gateleg-table-birch-80423883/>
- 테스트: `src/presentation/scene/gatelegTableProfile.test.ts`, `src/infrastructure/reference-data/data/brandCatalog.test.ts`, `e2e/retail-shapes.spec.ts`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/presentation/scene/gatelegTableProfile.test.ts src/infrastructure/reference-data/data/brandCatalog.test.ts`
- 종료 코드: `1`
- 실패: profile이 길이 0·부품 0개를 반환했고 카탈로그는 잘못된 1250×740mm footprint, 구 링크와 구조화되지 않은 이전 가격을 유지했다. 3개 실패, 9개 통과.

## GREEN

- 명령: `npx tsc --noEmit; npx vitest run src/presentation/scene/gatelegTableProfile.test.ts src/infrastructure/reference-data/data/brandCatalog.test.ts`
- 결과: 타입 검사와 12개 테스트 통과, 종료 코드 `0`.
- 구현: 260mm 중앙 상판·수납부, 630mm 펼친 날개, 반대쪽 접힌 날개, 게이트 다리 2개와 서랍 표현을 890×800×740mm envelope 안에 배치했다. 잘못된 옵션·소형 사용자 치수에서도 모든 부품은 양수다.

## REFACTOR

- 브라우저: 같은 890×800×740mm 위치·카메라에서 일반 4다리 식탁이 비대칭 드롭리프·수납형 게이트레그 식탁으로 교체됐다. 전후 캡처는 `output/playwright/norden-shape-baseline.png`, `norden-shape-improved.png`이다.
- E2E: 현재 SKU·가격, 26/89/152cm 상태 metadata, Box mesh 10개, 공식 기본 bounds, product dims와 WebGL context를 검증한다.
- 전체 검증: `npm run verify` 통과(59개 파일·257개 단위 테스트, statements 82.39%, branches 72.73%, functions 81.78%, lines 85.25%). `npm run test:preview -- --retries=0` 11개 통과. `npm run test:e2e -- --retries=0`은 외부 API 키가 필요한 2개를 명시적으로 skip하고 63개를 통과했다.
- 회귀 안정화: 전체 병렬 E2E에서 마지막으로 남아 있던 워크스루 충돌·3인칭 테스트의 고정 시간 대기를 실제 스폰 좌표·배치 준비 조건으로 교체했다. 제품 assertion은 유지했으며 최종 전체 실행은 무재시도로 통과했다.
- 당시 미확인: 26cm 접힘/152cm 완전 확장 상태를 사용자가 전환하는 기능은 이 단계에는 없었다. 후속 구현과 검증은 `2026-08-31-norden-dimension-variants.md`에 기록한다.
