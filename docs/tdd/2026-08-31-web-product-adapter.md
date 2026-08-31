# Schema.org·OpenGraph 오프라인 상품 어댑터

- 계약: 저장한 HTML 또는 JSON-LD의 Schema.org Product·Offer·QuantitativeValue를 Protocol 1.0으로 변환하고, JSON-LD가 없는 페이지는 OpenGraph 필드를 사용해야 한다. W/D/H·taxonomy·installation을 안전하게 얻지 못하면 override 없이 배치 가능한 feed를 생성하지 않는다.
- 테스트: `src/infrastructure/catalog-import/webProductAdapter.test.ts`, `scripts/check-catalog-protocol.ts`

## RED

- 명령: `npx vitest run src/application/webProductAdapter.test.ts`
- 종료 코드: `1`, 3개 실패.
- 실패 이유: 최소 스텁이 JSON-LD, OpenGraph, 치수 누락을 모두 `not-implemented`로 거절했다.

## GREEN

- 명령: 이동 후 `npx vitest run src/infrastructure/catalog-import/webProductAdapter.test.ts`
- 결과: JSON-LD 정상 경로, OpenGraph+override 경로, 치수 누락 거절 3개 통과.
- CLI: `npm run catalog:convert-web -- --input schemas/examples/livart-sofa.page.html --config schemas/examples/livart-sofa.adapter.json --output output/catalog-adapter/livart-sofa.catalog.json`
- 결과: `Hyundai Livart·1개 상품` 변환 통과.
- Conformance: `npm run test:catalog-protocol` — 2개 feed·4개 상품·web adapter 1개 통과.

## REFACTOR

- 초기에 application에 둔 HTML parser가 내부 레이어 커버리지를 `89.48% < 90%`로 낮추었다. 테스트로 숨기지 않고 외부 포맷 어댑터를 `infrastructure/catalog-import` 경계로 이동해 application lines를 `90.90%`로 복구했다.
- Schema.org JSON-LD 배열·`@graph`, 깨진 JSON-LD 블록 후속 탐색, Brand/ImageObject/Offer 형식을 공통 변환으로 격리했다.
- 리바트 fixture는 공식 페이지에서 확인한 최소 OpenGraph 사실 필드만 보존하고 전체 상품 페이지를 복제하지 않았다.
- 미확인: 한샘·까사미아·일룸의 실제 페이지별 필드 override 정책은 후속 전용 어댑터 범위다.
