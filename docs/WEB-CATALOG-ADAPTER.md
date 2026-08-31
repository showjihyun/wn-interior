# Schema.org·OpenGraph 웹 상품 어댑터

## 목적

쇼핑몰 상품 페이지에서 저장한 JSON-LD 또는 HTML을 HomePlan Catalog Protocol 1.0 feed로 변환한다. 어댑터는 URL을 직접 크롤링하지 않으며 로그인·봇 차단·CORS를 우회하지 않는다.

Schema.org Product의 `name`, `sku`, `brand`, `image`, `material`, `offers`, `width`, `depth`, `height`를 우선 사용한다. JSON-LD가 없으면 OpenGraph `og:title`, `og:image`, `product:price:amount`, `product:price:currency`를 사용한다.

## 사용법

1. 상품 페이지를 HTML로 저장하거나 `application/ld+json` 내용을 JSON 파일로 저장한다.
2. adapter config에 공급자·카테고리·치수·설치·가격 기준을 보강한다.
3. 다음 명령을 실행한다.

```powershell
npm run catalog:convert-web -- `
  --input schemas/examples/livart-sofa.page.html `
  --config schemas/examples/livart-sofa.adapter.json `
  --output output/catalog-adapter/livart-sofa.catalog.json
```

생성 feed는 왼쪽 패널의 `상품 카탈로그 JSON`으로 Import한다.

## adapter config

```json
{
  "sourceUrl": "https://shop.example.com/product/sku",
  "catalog": {
    "id": "provider-ko",
    "provider": "Provider",
    "locale": "ko-KR",
    "generatedAt": "2026-08-31T00:00:00.000Z"
  },
  "overrides": {
    "externalId": "SKU",
    "brand": "브랜드",
    "classification": { "category": "seating.sofa" },
    "dimensions": { "width": 3000, "depth": 950, "height": 870, "unit": "mm" },
    "priceBasis": "본체 1개",
    "checkedAt": "2026-08-31",
    "render": { "shapeHint": "sofa3" },
    "installation": { "mount": "floor", "provides": ["seating.sofa"] }
  }
}
```

## 경계

- W/D/H가 JSON-LD에 없으면 `dimensions` override는 필수다.
- taxonomy와 installation은 사이트 표시 문구로 자동 추정하지 않고 override를 요구한다.
- OpenGraph 가격은 현재가·옵션가를 반드시 구분하지 못하므로 `priceBasis`·`checkedAt`을 보강해야 한다.
- 원격 이미지는 Protocol의 출처 asset로만 남는다. 권리·해시·CORS 검증 전에는 WebGL 텍스처로 사용하지 않는다.
- 전용 어댑터가 필요한 사이트는 이 공통 결과에 데이터를 보강하는 infrastructure package로 추가한다.
