# 한샘·리바트 CSV/XLSX bridge

- 계약: 동일한 상품 행을 CSV와 XLSX에서 읽으면 동일한 HomePlan Catalog Protocol 1.0 feed를 만들어야 한다.
- 안전 경계: 필수 치수·taxonomy·출처·installation이 없으면 기존 Protocol validator가 거절하고, 계산 캐시 없는 XLSX 수식도 거절한다.
- 테스트: `src/infrastructure/catalog-import/catalogSpreadsheetBridge.test.ts`, `scripts/check-catalog-templates.ts`

## RED

- 명령: `npx vitest run src/infrastructure/catalog-import/catalogSpreadsheetBridge.test.ts`
- 결과: 3개 실패, 모두 `catalog-spreadsheet-bridge-not-implemented`.
- 대상: CSV 인용부호/복수값/의존성 변환, 브랜드 기본값, 필수 데이터 누락 최종 거절.

## GREEN

- 같은 명령 결과: 3개 통과.
- `npx tsc --noEmit`: 통과.
- CSV parser가 BOM, CRLF, escaped quote, 빈 행, `|` 복수값, boolean, 천 단위 쉼표를 정규화한다.
- XLSX reader는 `data_only=False/True` workbook을 함께 열어 수식 존재와 cached value를 구분한다.

## 통합 결함과 수정

- 최초 XLSX 변환에서 헤더 행이 상품으로 다시 읽혀 category/치수/출처 검증이 실패했다.
- 원인: `iter_rows()`를 헤더와 본문에서 따로 호출해 매번 새 iterator가 시작되었다.
- 수정: formula/value workbook별 iterator 하나를 만들고 헤더를 소비한 동일 iterator로 본문을 순회했다.
- Windows pipe에서 한국어가 대체 문자로 손상되는 문제도 발견해 Python subprocess에 `PYTHONIOENCODING=utf-8`을 고정했다.

## REFACTOR / CONFORMANCE

- 한샘·리바트 XLSX: `products`, `guide`, 숨김 `lists` 시트, 31컬럼, freeze `A2`, auto filter, 6개 표준값 validation 확인.
- 브랜드별 CSV와 XLSX를 각각 변환한 JSON 구조가 완전히 일치한다.
- `npm run test:catalog-templates`: 한샘·리바트 CSV/XLSX 동등성 및 web override 구조 통과.
- `npm run verify`: 73개 파일·323개 테스트, architecture typecheck, lint, format, production build, bundle budget 통과.
- LibreOffice/Poppler가 현재 환경에 없어 PDF/PNG 렌더 검수는 수행하지 못했다. 대신 openpyxl로 시트, 행·열, 고정창, 필터, validation 구조를 직접 검사했다.
