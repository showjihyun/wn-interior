# MALM·LACK 현재 판매 계약 TDD 기록

- 계약: MALM과 LACK은 IKEA Korea의 현재 SKU·가격·실측·포함/제외 구성·공식 이미지와 일치하고, 배치 장면은 판매 구성에 없는 부품을 추가하지 않는다.
- 테스트: `src/presentation/scene/highBedFrameProfile.test.ts`, `src/presentation/scene/shelfCoffeeTableProfile.test.ts`, `src/infrastructure/reference-data/data/brandCatalog.test.ts`, `src/infrastructure/reference-data/IkeaRetailCatalog.test.ts`, `e2e/retail-shapes.spec.ts`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/presentation/scene/highBedFrameProfile.test.ts src/presentation/scene/shelfCoffeeTableProfile.test.ts src/infrastructure/reference-data/data/brandCatalog.test.ts src/infrastructure/reference-data/IkeaRetailCatalog.test.ts`
- 종료 코드: 1
- 결과: 4개 파일에서 7개 테스트 실패.
- 실패 이유:
  - MALM 프로필 stub은 매트리스·갈빗살을 포함한다고 표시하고 부품이 없었다.
  - LACK 프로필 stub은 하부 선반·다리가 없었다.
  - MALM은 기존 434,000원 조합 가격과 2110mm 길이를 사용했고 `retail/appearance`가 없었다.
  - LACK은 이전 조합 링크와 모델명만 있었고 현재 SKU·가격·하부선반·`retail/appearance` 계약이 없었다.

## GREEN

- 명령: RED와 동일
- 결과: 4개 파일, 21개 테스트 통과, 종료 코드 0.
- 자산 계약: `npm run test:retail-assets`에서 IKEA 공식 이미지 9개와 SHA-256 대응 통과.
- 대상 E2E: MALM·LACK 개발 서버 2개 및 production preview 2개 통과.

## REFACTOR

- 변경:
  - MALM은 헤드보드·발판·측면 레일·미드빔만 만드는 순수 `highBedFrame` 프로필로 분리했다.
  - LACK은 상판·하부선반·다리 4개를 만드는 순수 `shelfCoffeeTable` 프로필로 분리했다.
  - 실측 envelope와 부품 유효성을 정상 입력 및 작은 경계 입력에서 검증한다.
- 시각 검증: `output/playwright/malm-current-retail.png`, `output/playwright/lack-current-retail.png`에서 공식 이미지, SKU, 가격, 실측과 실제 축척 배치를 확인했다.
- 전체 검증:
  - `npm run verify`: 통과. Vitest 63개 파일, 272개 테스트 통과. Statements 82.48%, Branches 72.56%, Functions 81.13%, Lines 85.24%.
  - `npm run test:e2e -- --retries=0`: 66개 통과, 외부 OpenRouter 의존 2개 skip.
  - `npm run test:preview -- --retries=0`: production preview 14개 통과.
- 미확인/skip: 외부 OpenRouter 실서비스 2개는 이번 상품 계약과 무관하며 기존 조건부 skip 상태다.
