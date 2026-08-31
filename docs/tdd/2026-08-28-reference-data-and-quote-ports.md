# Reference-data ports and GenerateQuote

- 계약: 시작 프로젝트와 견적 생성은 `src/data`, 시스템 시각, 구체 재료 조회에 직접 의존하지 않고 주입된 포트만 사용한다.
- 테스트: `src/application/projectService.test.ts`, `src/application/quoteDocument.test.ts`, `src/application/generateQuote.test.ts`, `src/infrastructure/reference-data/StaticReferenceData.test.ts`

## RED

- 명령: `npx vitest run src/application/projectService.test.ts src/application/quoteDocument.test.ts`
- 종료 코드: `1`
- 실패 이유:
  - `ProjectService`가 주입된 시작 프로젝트 대신 `SAMPLE_PLAN`을 직접 사용했다.
  - 견적 생성기가 주입된 작성 시각과 재료 이름 대신 `new Date()`와 정적 `getMaterial`을 사용했다.

## GREEN

- 명령: `npx vitest run src/application/projectService.test.ts src/application/quoteDocument.test.ts src/application/generateQuote.test.ts src/infrastructure/reference-data/StaticReferenceData.test.ts`
- 결과: 4개 파일, 9개 테스트 통과, 종료 코드 `0`

## REFACTOR

- `ProjectService`의 JSON 직렬화 복제를 명시적 값 복제로 교체했다.
- 정적 샘플·제품·재료 데이터는 infrastructure adapter 뒤로 이동했다.
- `GenerateQuote`가 `Clock`, `ProductCatalog`, `MaterialCatalog`를 통해 견적을 생성한다.
- 검증: 대상 ESLint 통과, Prettier 통과, 테스트 계약 검사 33개 파일 통과.
- 전체 단위 테스트: 26개 파일, 172개 테스트 통과.
- 최종 전체 검증: `npm run verify` 통과, 39개 파일·198개 테스트 통과.
