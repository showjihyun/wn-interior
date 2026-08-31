# PAX/FORSAND 공식 이미지 계약 TDD 기록

- 계약: PAX/FORSAND는 한국어 IKEA Korea의 현재 670,000원 조합과 2프레임·4도어·손잡이 미포함 형상을 유지하면서, 포함·제외 구성과 일치하는 공식 대표 이미지를 카드와 3D 사진 레이어에 사용한다.
- 테스트: `src/infrastructure/reference-data/data/brandCatalog.test.ts`, `src/infrastructure/reference-data/IkeaRetailCatalog.test.ts`, `e2e/retail-shapes.spec.ts`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/infrastructure/reference-data/data/brandCatalog.test.ts src/infrastructure/reference-data/IkeaRetailCatalog.test.ts`
- 종료 코드: 1
- 결과: 2개 파일에서 2개 테스트 실패.
- 실패 이유: PAX/FORSAND에 공식 이미지 `appearance` 및 SHA-256 계약이 없었다.

## GREEN

- 명령: RED와 동일
- 결과: 2개 파일, 17개 테스트 통과, 종료 코드 0.
- 자산 계약: `npm run test:retail-assets`에서 IKEA 공식 이미지 12개와 SHA-256 대응 통과.
- 대상 E2E: PAX/FORSAND 개발 서버 1개 및 production preview 1개 통과. 공식 이미지 로드, 2프레임·4도어, 손잡이 미포함, 가격 합계를 함께 검증했다.

## REFACTOR

- 변경: 기존 `modularWardrobe` 형상과 한국어 가격 계약은 수정하지 않고 공식 이미지 자산만 추가했다.
- 테스트 정리: 최초 대상 E2E는 가격 탭 전환 후 사라진 카탈로그 카드의 상태 배지를 조회해 실패했다. 이미지 로드 상태를 카탈로그 탭에서 먼저 확인한 뒤 가격 합계를 검증하도록 사용자 흐름 순서로 수정했다.
- 시각 검증: `output/playwright/pax-forsand-official-image.png`에서 공식 이미지, SKU, 670,000원, 실측과 실제 축척 배치를 확인했다.
- 전체 검증:
  - `npm run verify`: 통과. Vitest 63개 파일, 272개 테스트 통과. Statements 82.48%, Branches 72.56%, Functions 81.13%, Lines 85.24%.
  - `npm run test:e2e -- --retries=0`: 66개 통과, 외부 OpenRouter 의존 2개 skip.
  - `npm run test:preview -- --retries=0`: production preview 14개 통과.
- 미확인/skip: 외부 OpenRouter 실서비스 2개는 이번 PAX/FORSAND 이미지 계약과 무관하며 기존 조건부 skip 상태다.
