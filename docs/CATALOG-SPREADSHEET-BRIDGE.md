# 한샘·리바트 CSV/XLSX 카탈로그 bridge

## 제공 파일

다운로드 가능한 CSV/XLSX는 `public/catalog-templates/`, 변환 config와 web override는 `schemas/templates/`에 둔다.

- `public/catalog-templates/hanssem-catalog-template.csv`, `hanssem-catalog-template.xlsx`
- `public/catalog-templates/livart-catalog-template.csv`, `livart-catalog-template.xlsx`
- `hanssem-sheet.config.json`, `livart-sheet.config.json`: 브랜드·provider·기본 단위 프리셋
- `hanssem-web-override.template.json`, `livart-web-override.template.json`: 저장한 상품 HTML/JSON-LD를 변환할 때 쓰는 사이트 전용 보정 템플릿

XLSX의 `products` 시트에는 필터, 첫 행 고정, 표준값 드롭다운, 필수값 누락 강조가 적용되어 있다. `guide` 시트에는 모든 컬럼 설명이 있고, 드롭다운 원본인 숨김 `lists` 시트가 있다. 포함된 한 행은 형식 확인용 예시이며 실상품 자료가 아니다.

## 컬럼 규약

| 그룹      | 컬럼                                                                                        | 규칙                                                                       |
| --------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 식별      | `external_id`, `name`, `brand`, `sku`                                                       | `external_id`, `name`, `brand` 필수. 브랜드는 전용 config 기본값 사용 가능 |
| 분류      | `category`, `tags`                                                                          | `category` 필수. 복수 태그는 `                                             | ` 구분                                  |
| 치수      | `width`, `depth`, `height`, `unit`                                                          | 세 치수와 `mm`/`cm`/`m` 단위 필수                                          |
| 근거      | `source_url`, `retrieved_at`                                                                | 실제 HTTPS 상품 URL과 ISO 확인 시각 필수                                   |
| 가격      | `price_amount`, `price_currency`, `price_checked_at`, `price_basis`, `included`, `excluded` | 가격을 적으면 나머지 가격 근거도 필수. v1 통화는 `KRW`                     |
| 표현      | `materials`, `images`, `colorways`, `shape_hint`                                            | 복수값은 `                                                                 | `. 색상은 `#RRGGBB`, 이미지는 HTTPS URL |
| 설치      | `mount`, `snap_to_wall`, `default_elevation`                                                | `mount` 필수. boolean은 true/false, 1/0, yes/no 허용                       |
| 의존성    | `provides`, `requires_all`, `requires_any`, `dependency_scope`                              | capability 복수값은 `                                                      | `; scope는 `support-chain`또는`project` |
| 표면 배치 | `surface_supported_by`, `surface_anchor`                                                    | `mount=surface`이면 지원 capability가 반드시 필요                          |

공백 셀에만 브랜드 config의 기본값을 채운다. CSV는 쉼표와 큰따옴표 escaping을 지원하며, Excel 호환 UTF-8 BOM도 처리한다. 숫자의 천 단위 쉼표도 제거한다. 최종 결과는 항상 Catalog Protocol validator를 통과해야 파일로 기록된다.

수전은 다음처럼 하부장과 싱크가 동일 support chain에 모두 있어야 배치되도록 표현할 수 있다.

```text
mount=surface
requires_all=support.base-cabinet|support.kitchen-sink
dependency_scope=support-chain
surface_supported_by=support.kitchen-sink
surface_anchor=rear
```

## CSV/XLSX 변환

### 브라우저에서 바로 가져오기

좌측 제품 카탈로그의 `상품 카탈로그 파일`에서 `.json`, `.csv`, `.tsv`, `.xlsx`를 직접 선택할 수 있다. 한샘·리바트 XLSX/CSV 템플릿도 같은 영역에서 다운로드한다. 브라우저 Import는 다음 경계를 적용한다.

- 파일 크기 최대 10MB
- XLSX는 이름이 `products`인 시트를 사용
- 한 파일에는 한샘 또는 리바트 한 브랜드만 허용
- XLSX 수식은 계산 결과의 신뢰성을 보장할 수 없어 모두 거절. 값으로 붙여넣은 뒤 저장해야 함
- 변환 후에도 기존 Protocol validator를 통과한 경우에만 전체 상품을 한 번에 적용

XLSX parser는 파일을 선택했을 때만 동적 로드되어 일반 2D/3D 초기 화면 번들에 포함되지 않는다.

### CLI 변환

```powershell
npm run catalog:convert-sheet -- `
  --input public/catalog-templates/hanssem-catalog-template.xlsx `
  --config schemas/templates/hanssem-sheet.config.json `
  --output output/hanssem.catalog.json
```

CSV와 TSV도 같은 명령을 사용한다. XLSX는 기본적으로 `products` 시트를 읽으며 `--sheet 다른시트`로 바꿀 수 있다.

XLSX 수식 셀은 저장된 계산 결과(cache)가 있을 때만 읽는다. 캐시가 없으면 `formula-cache-missing:<sheet>!<cell>`로 중단한다. 따라서 수식이 있는 파일은 Excel/LibreOffice에서 재계산 후 저장하거나, 안정적인 import를 위해 값으로 붙여넣는다.

CLI는 캐시된 수식 결과를 허용하지만 브라우저 Import는 더 보수적으로 모든 수식을 거절한다.

## 웹 override 사용

상품 페이지를 HTML로 저장하고 브랜드 전용 `*-web-override.template.json`을 복사한 뒤 다음 값을 실제 근거로 교체한다.

- `sourceUrl`, `externalId`, `sku`
- 자동 추출이 불가능하거나 애매한 `classification.category`, W/D/H
- 가격의 구성 기준과 확인일
- `installation` capability와 설치 면

```powershell
npm run catalog:convert-web -- `
  --input saved-product.html `
  --config schemas/templates/livart-web-override.template.json `
  --output output/livart-product.catalog.json
```

페이지에 이름·이미지·가격이 있으면 adapter가 우선 사용하지만 치수·taxonomy·installation은 템플릿의 명시값으로 보강한다. 템플릿의 `REPLACE_WITH_*` 값은 그대로 운영 데이터에 사용하면 안 된다.

## 검증과 재생성

```powershell
npm run catalog:create-templates
npm run test:catalog-templates
```

첫 명령은 `scripts/create_catalog_templates.py`로 CSV/XLSX/config를 재생성한다. 두 번째 명령은 한샘·리바트의 CSV와 XLSX를 각각 Protocol feed로 변환해 byte-level JSON 구조가 같은지 확인하고, web override 필수 구조도 검사한다.
