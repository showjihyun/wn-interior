# FADO 현재 판매 단품 계약 TDD 기록

- 계약: FADO 카탈로그 항목은 IKEA Korea의 현재 판매 화이트 25cm 단품 SKU·가격·치수·공식 이미지와 일치하고, 배치 시 같은 실측 형상과 사진 텍스처 및 가격 합계를 사용한다.
- 테스트: `src/infrastructure/reference-data/data/brandCatalog.test.ts`, `src/infrastructure/reference-data/IkeaRetailCatalog.test.ts`, `src/presentation/scene/tableGlobeLampProfile.test.ts`, `e2e/retail-shapes.spec.ts`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/infrastructure/reference-data/data/brandCatalog.test.ts src/infrastructure/reference-data/IkeaRetailCatalog.test.ts src/presentation/scene/tableGlobeLampProfile.test.ts`
- 종료 코드: 1
- 실패 이유: 기존 항목이 `FADO 200mm`와 폐기된 조합 링크를 사용했고 구조화된 `retail` 및 `appearance`가 없어서 현재 SKU 계약과 실상품 이미지 계약이 각각 실패했다.
- 참고: 첫 실행에서 실수치 부동소수점 비교 1건도 함께 실패했다. 이를 `toBeCloseTo`로 바로잡은 뒤 다시 실행해 위 두 계약 실패만 RED 증거로 확정했다.

## GREEN

- 명령: RED와 동일
- 결과: 3개 파일, 17개 테스트 통과, 종료 코드 0
- 자산 계약: `npm run test:retail-assets`에서 IKEA 공식 이미지 7개와 SHA-256 대응 통과
- 대상 E2E: FADO 개발 서버 1개 및 production preview 1개 통과

## REFACTOR

- 변경: 공식 25cm envelope를 기존 순수 `tableGlobeLamp` 프로필에 그대로 주입하고 별도 FADO 전용 렌더 분기를 추가하지 않았다.
- 시각 검증: `output/playwright/fado-current-retail.png`에서 공식 이미지, SKU, 가격, 실측, 실제 축척 배치를 확인했다.
- 전체 검증:
  - `npm run verify`: 통과. Vitest 61개 파일, 266개 테스트 통과. Statements 82.50%, Branches 72.92%, Functions 81.26%, Lines 85.30%.
  - `npm run test:e2e -- --retries=0`: 64개 통과, 외부 OpenRouter 의존 2개 skip.
  - `npm run test:preview -- --retries=0`: production preview 12개 통과.
- 미확인/skip: 외부 OpenRouter 실서비스 2개는 이번 FADO 계약과 무관하며 기존 조건부 skip 상태다.
