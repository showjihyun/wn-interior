# PAX/FORSAND 모듈 옷장 TDD 기록

## 목표

기존 일반 옷장 대체 형상을 IKEA Korea에서 실제 판매하는 PAX/FORSAND 200cm 조합의 공식 SKU, 가격, 치수, 포함 구성과 일치시키고 프레임 2개·도어 4개가 보이는 전용 형상으로 렌더링한다.

## RED

- `modularWardrobeProfile.test.ts`에서 공식 2000×600×2012mm envelope, 프레임 2개, 도어 4개, 손잡이 미포함 계약을 먼저 작성했다.
- `brandCatalog.test.ts`에서 상품번호 `495.010.34`, 670,000원, 공식 링크, 포함·제외 구성과 `modularWardrobe` 형상을 요구했다.
- 초기 실행은 프로필 stub의 0개 구성과 기존 PAX 카탈로그 정보 때문에 3개 테스트가 실패했다.

## GREEN

- 실측 envelope 안에 100cm 프레임 2개, 50cm 도어 4개와 하부 플린스를 생성하는 순수 프로필을 구현했다.
- PAX/FORSAND 카탈로그를 공식 SKU, 가격, 치수, 구성 정보로 갱신했다.
- 카탈로그에서 배치한 형상이 7개 박스 메시, 정확한 경계, 벽 부착 속성과 가격 합계를 유지하는 E2E 테스트를 추가했다.
- production preview에서도 전용 형상과 WebGL context 유지를 검증한다.

## 검증 결과

- `npm run verify`: 통과
  - 테스트 계약 71개 파일, IKEA 실상품 이미지 6개, 생성 메시 manifest·SHA-256·GLB 계약 통과
  - 아키텍처 타입 검사, ESLint, Prettier, production build와 번들 예산 통과
  - Vitest 61개 파일, 265개 테스트 통과
  - 커버리지: Statements 82.50%, Branches 72.92%, Functions 81.26%, Lines 85.30%
- `npm run test:e2e -- --retries=0`: 64개 통과, 외부 OpenRouter 의존 2개 skip
- `npm run test:preview -- --retries=0`: production preview 12개 통과
