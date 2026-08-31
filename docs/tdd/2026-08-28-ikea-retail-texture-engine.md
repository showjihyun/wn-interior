# IKEA Korea 실상품 카탈로그와 이미지 텍스처 엔진

- 계약: IKEA Korea 공식 판매 상품 6종은 제품번호·실측·현재가·가격 구성 기준·공식 링크·이미지 원본/로컬 스냅샷/SHA-256을 가지며, 실제 이미지는 흰 배경 제거 후 ref-count texture cache를 통해 3D 형상에 투영된다.
- 테스트: `src/infrastructure/reference-data/IkeaRetailCatalog.test.ts`, `src/presentation/texture/productTextureMath.test.ts`, `src/presentation/texture/ProductTextureEngine.test.ts`, `e2e/retail-texture.spec.ts`

## RED

- 명령: `npx vitest run src/infrastructure/reference-data/IkeaRetailCatalog.test.ts src/presentation/texture/productTextureMath.test.ts`
- 종료 코드: `1`
- 실패 이유: 6종 중 기존 KIVIK 1종만 존재했고 `retail/appearance`가 없었으며, 흰 배경 alpha가 255로 유지되고 밝은 가장자리도 감쇠되지 않아 4개 테스트가 실패했다.
- 명령: `npx vitest run src/presentation/texture/ProductTextureEngine.test.ts`
- 종료 코드: `1`
- 실패 이유: 같은 이미지를 동시에 acquire할 때 loader가 2회 호출되고 release 후 dispose되지 않았다.

## GREEN

- 명령: `npx vitest run src/infrastructure/reference-data/IkeaRetailCatalog.test.ts src/presentation/texture/productTextureMath.test.ts src/presentation/texture/ProductTextureEngine.test.ts`
- 결과: 3개 파일, 6개 테스트 통과.
- 이미지 계약: `npm run test:retail-assets` — 6개 로컬 파일과 JSON SHA-256 일치.
- 단위 테스트: `npm run test:unit` — 42개 파일, 204개 테스트 통과.
- 전용 브라우저: `npx playwright test e2e/retail-texture.spec.ts --retries=0` — 카드 이미지/가격 기준/확인일, texture cache, WebGL 픽셀 검증 통과.

## REFACTOR

- Product에 구조화된 `retail`/`appearance` 계약과 `inductionHob`, `faucet`, `kitchenSink` 형상을 추가했다.
- 공식 OG 이미지는 CORS 제한 때문에 `public/catalog/ikea/` 로컬 스냅샷으로 보존하고 원본 URL·SHA-256을 함께 저장했다.
- 흰 배경은 가장자리에서 연결된 밝은 픽셀만 flood-fill alpha 처리하여 흰색 제품 자체를 최대한 보존하고, opaque bounds로 자동 crop한다.
- texture cache는 동일 URL을 한 번만 로드하고 마지막 release 또는 `disposeAll`에서 Three texture를 해제한다.
- 파라메트릭 형상이 깊이·측면·그림자를 제공하고 실제 이미지는 front/top/curtain/cutout 면에 decal로 투영된다.
- 전체 검증: `npm run verify` 통과(42개 파일·204개 테스트, statements 86.76%, branches 77.76%, functions 84.26%, lines 89.86%).
- 전체 브라우저: `npm run test:e2e` 58개 통과, 외부 AI 키 필요 2개 skip.
- production preview: `npm run test:preview` 4개 통과(실상품 이미지 배포·texture cache 포함).
- 미확인/주의: 가격과 재고는 2026-08-28 스냅샷이며 자동 주문 가격이 아니다. IKEA 공식 페이지에서 구매 직전에 다시 확인해야 한다.
