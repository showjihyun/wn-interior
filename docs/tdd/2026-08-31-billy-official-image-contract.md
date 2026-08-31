# BILLY 공식 이미지 계약 TDD 기록

- 계약: BILLY는 기존의 정확한 현재 SKU·가격·800×280×2020mm 5단 열린 책장 형상을 유지하면서, 검증된 공식 대표 이미지를 카드와 3D 텍스처에 사용한다.
- 테스트: `src/infrastructure/reference-data/data/brandCatalog.test.ts`, `src/infrastructure/reference-data/IkeaRetailCatalog.test.ts`, `e2e/retail-shapes.spec.ts`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/infrastructure/reference-data/data/brandCatalog.test.ts src/infrastructure/reference-data/IkeaRetailCatalog.test.ts`
- 종료 코드: 1
- 결과: 2개 파일에서 2개 테스트 실패.
- 실패 이유: BILLY의 가격 확인일이 2026-08-28로 남아 있었고 공식 이미지 `appearance` 및 SHA-256 계약이 없었다.

## GREEN

- 명령: RED와 동일
- 결과: 2개 파일, 17개 테스트 통과, 종료 코드 0.
- 자산 계약: `npm run test:retail-assets`에서 IKEA 공식 이미지 10개와 SHA-256 대응 통과.
- 대상 E2E: BILLY 개발 서버 1개 및 production preview 1개 통과.

## REFACTOR

- 변경: 기존 `openBookcase` 형상은 수정하지 않고 공식 이미지와 확인일만 추가했다. 정확한 화이트 SKU와 사진이 일치하도록 다른 색상 스와치는 제거했다.
- 시각 검증: `output/playwright/billy-current-retail.png`에서 빈 책장 공식 이미지, SKU, 가격, 실측과 실제 축척 배치를 확인했다.
- 전체 검증:
  - `npm run verify`: 통과. Vitest 63개 파일, 272개 테스트 통과. Statements 82.48%, Branches 72.56%, Functions 81.13%, Lines 85.24%.
  - `npm run test:e2e -- --retries=0`: 66개 통과, 외부 OpenRouter 의존 2개 skip.
  - `npm run test:preview -- --retries=0`: production preview 14개 통과.
- 미확인/skip: 외부 OpenRouter 실서비스 2개는 이번 BILLY 이미지 계약과 무관하며 기존 조건부 skip 상태다.
