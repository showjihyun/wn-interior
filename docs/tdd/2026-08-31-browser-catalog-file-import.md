# 브라우저 CSV/XLSX 카탈로그 Import

- 계약: 사용자가 좌측 카탈로그에서 한샘·리바트 CSV/XLSX를 직접 선택하면 브랜드 preset을 결정하고 기존 Protocol validator와 원자적 Import 경로에 전달한다.
- 안전 경계: 10MB 초과, 혼합/미지원 브랜드, 필수 헤더 누락, 미지원 확장자, XLSX 수식은 적용 전에 거절한다.
- 테스트: `src/infrastructure/catalog-import/browserCatalogFile.test.ts`, `e2e/app.spec.ts`

## RED

- 명령: `npx vitest run src/infrastructure/catalog-import/browserCatalogFile.test.ts`
- 결과: 3개 실패.
- 원인: CSV, XLSX, 오류 경로 모두 `browser-catalog-file-not-implemented`로 종료.

## GREEN

- 한샘 CSV → `hanssem-ko`/`Hanssem`, 리바트 XLSX → `hyundai-livart-ko`/`Hyundai Livart` preset 적용.
- 미지원 브랜드·확장자를 구조화된 오류 code로 거절.
- XLSX formula XML을 탐지해 `spreadsheet-formula-unsupported`로 거절하는 회귀 테스트 추가.
- `read-excel-file`과 `fflate`는 XLSX 선택 시에만 동적 import.

## UI / 통합

- 기존 JSON 전용 버튼을 JSON·CSV·TSV·XLSX 공통 파일 선택으로 확장.
- 한샘·리바트 XLSX/CSV 다운로드 링크를 같은 작업 영역에 배치.
- 처리 중 버튼 잠금과 파일명 상태, 경계별 한국어 오류 안내를 제공.
- 기존 `importProductCatalog`를 그대로 호출해 신규/갱신 계산, Undo/Redo, 자동저장, 실패 시 무변경 계약을 재사용.

## 검증

- `npx playwright test e2e/app.spec.ts --grep "카탈로그" --workers=1`: 관련 7개 통과. 기존 JSON 성공/거절 뒤 실제 리바트 XLSX를 올려 카드 노출 확인.
- Playwright CLI headed 브라우저: 리바트 XLSX 신규 1개, 거실/리바트 필터와 W300cm·가격 카드 확인, 콘솔 오류/경고 0.
- screenshot: `output/playwright/catalog-import-2026-08-31/xlsx-import-livart.png`.
- `npm run verify`: 74개 파일·327개 테스트, architecture typecheck, lint, format, build 통과.
- production build: `catalog-xlsx` 89.84kB(gzip 27.97kB) lazy chunk, `index.html` modulepreload 제외. 번들 검사에 lazy chunk 존재/초기 preload 금지 계약 추가.
- `npm audit --omit=dev --registry=https://registry.npmjs.org`: 취약점 0건.
