# HomePlan Catalog Protocol 1.0 구현 계획

## 1. 목적과 범위

IKEA Korea 데이터에서 검증한 상품 식별자, 공식 치수, 가격 기준, 옵션, 출처 이미지와 설치 의미를 일반화해 국내 가구·인테리어 상품 데이터를 같은 형식으로 교환한다. 이 문서는 업계 채택 전의 **상호운용 초안**이며, 특정 쇼핑몰 DOM이나 비공개 API를 표준으로 고정하지 않는다.

v1은 다음을 제공한다.

- 버전형 JSON 문서와 JSON Schema
- 사이트/수집기 독립적인 상품·옵션·가격·자산·출처 필드
- mm·KRW 내부 정규화와 안정적인 외부 ID namespace
- 설치 capability와 `allOf`/`anyOf` 의존성
- 원자적 Import와 경로별 오류·경고 보고
- 현재 프로젝트의 가져온 상품 보존과 재가져오기 갱신
- JSON 파일 Import UI와 배치 게이트

v1에서 제외한다.

- 쇼핑몰 로그인, 봇 차단 우회, DOM 크롤러를 앱에 내장하는 기능
- 제3자 이미지의 자동 다운로드·재배포 또는 CORS 우회
- 치수 없는 상품을 추정 치수로 3D 배치 가능하게 만드는 기능
- 업계 공식 표준이라는 주장. 실제 채택·거버넌스·식별자 등록소는 별도 과정이다.

## 2. 웹 데이터 교집합

국내 공식 상품 페이지와 현재 IKEA 데이터에서 공통으로 얻을 수 있는 정보는 다음과 같다.

| 영역 | v1 필드                                                 | 판정                                       |
| ---- | ------------------------------------------------------- | ------------------------------------------ |
| 식별 | provider, catalogId, externalId, brand, sku/model, name | 필수: externalId, name, brand              |
| 출처 | product URL, retrievedAt, locale                        | 필수: HTTPS URL, 수집 시각                 |
| 공간 | width, depth, height, unit                              | 3D Import 필수, mm로 정규화                |
| 분류 | 표준 taxonomy, tags                                     | 필수, 내부 CategoryId로 매핑               |
| 가격 | amount, currency, checkedAt, basis, included/excluded   | 선택. 가격이 있으면 기준 필수              |
| 옵션 | 색상·사이즈·구성 variant                                | 선택, 독립 ID와 치수/가격 override         |
| 시각 | image/model URL, role, hash, rights                     | 선택. 원격 URL은 출처이며 자동 텍스처 아님 |
| 소재 | materials, finish, color                                | 선택, 검색·표시용                          |
| 설치 | mount, shapeHint, provides, requires, surface support   | 배치 상품은 필수                           |

HTML에서 이 필드를 얻는 방식은 사이트별 어댑터 책임이다. `schema.org/Product` JSON-LD는 이름·브랜드·SKU·이미지·Offer의 공통 입력 후보지만, W/D/H와 설치 의존성이 없으면 프로토콜 완성 상품이 아니다.

## 3. 문서 구조

```json
{
  "$schema": "https://homeplan3d.dev/schemas/catalog-1.0.json",
  "protocol": "homeplan.catalog",
  "version": "1.0",
  "catalog": {
    "id": "hyundai-livart-ko",
    "provider": "Hyundai Livart",
    "locale": "ko-KR",
    "generatedAt": "2026-08-31T00:00:00.000Z"
  },
  "products": []
}
```

상품은 `identity`, `source`, `classification`, `dimensions`, 선택적 `price`, `variants`, `assets`, `materials`, `installation`, `render`, `extensions`를 가진다. 알 수 없는 최상위 필드는 거절하고, 벤더 확장은 reverse-domain key를 쓰는 `extensions` 아래에만 둔다.

## 4. 설치 capability와 의존성

capability는 소문자 점 표기 문자열을 사용한다.

- `kitchen.base-cabinet`
- `kitchen.countertop`
- `kitchen.sink`
- `wall.anchor`
- `ceiling.anchor`

`installation.provides`는 제품이 제공하는 capability다. `requires.allOf`는 모두 필요하고 `requires.anyOf`는 하나 이상 필요하다. `scope`는 `project` 또는 `support-chain`이다. 상판 제품은 `surface.supportedBy`로 물리적 받침 capability도 선언한다.

IKEA 주방 체인은 다음과 같다.

```text
METOD base cabinet
  provides: kitchen.base-cabinet, kitchen.countertop
  └─ KILSVIKEN sink
       requires allOf: kitchen.base-cabinet
       provides: kitchen.sink
  └─ ALMAREN faucet
       supportedBy: kitchen.base-cabinet
       requires allOf: kitchen.base-cabinet, kitchen.sink
```

수전은 같은 하부장 support chain에 싱크가 먼저 배치돼야 한다. 다른 방이나 다른 하부장의 싱크는 조건을 충족하지 않는다. 제공자를 삭제해 종속 배치를 고아로 만드는 동작은 거절한다.

## 5. Import 계약

1. JSON 구문과 protocol/version을 검사한다.
2. catalog와 product ID를 정규화하되 원본 ID도 보존한다.
3. URL·날짜·통화·단위·치수·가격·variant·capability 문법을 검사한다.
4. cm/m를 mm로 바꾸고 KRW 가격을 정수로 보존한다.
5. taxonomy를 내부 category로 매핑한다.
6. 지원 shapeHint가 없으면 `box`를 사용하고 warning을 남긴다.
7. 모든 제품을 먼저 변환한 뒤 fatal issue가 없을 때만 한 번에 반영한다.
8. 같은 namespace ID는 갱신하고, 다른 provider가 같은 ID를 주장하면 충돌로 거절한다.

오류는 `{severity, code, path, message}`로 반환한다. UI는 성공·갱신·경고·거절 건수를 표시한다.

## 6. 레이어 배치

- domain: 설치 capability/의존성 판정과 Product의 정규화된 계약
- application: 프로토콜 DTO, validator, unit/category/shape normalization, Import result
- infrastructure: 기존 IKEA/브랜드 데이터와 향후 사이트 추출기의 어댑터
- presentation: 파일 선택, 결과 표시, Zustand의 원자적 반영

domain/application은 DOM, fetch, React, Zustand를 참조하지 않는다. 직접 URL 수집 기능을 추가할 경우 별도 infrastructure gateway로만 연결한다.

## 7. TDD와 완료 조건

RED 계약:

- 유효한 국내 상품 feed가 mm Product로 변환되지 않음
- 중복 ID·치수 누락·잘못된 URL 문서가 원자적으로 거절되지 않음
- 하부장만 있는 상태에서 수전이 배치됨
- 하부장+싱크가 같은 chain에 있을 때도 수전 의존성을 표현할 방법이 없음
- JSON Import UI와 결과 보고가 없음

완료 조건:

- JSON Schema와 TypeScript validator가 같은 fixture를 통과/거절한다.
- IKEA 데이터로 만든 protocol fixture와 국내 상품 fixture가 정규화된다.
- Import 실패 시 기존 상품 배열·히스토리가 바뀌지 않는다.
- 같은 support chain의 AND 의존성이 단위·E2E에서 검증된다.
- 저장·재열기 후 protocol provenance와 설치 계약이 보존된다.
- 실제 브라우저에서 Import→카드 노출→배치 또는 누락 조건 안내를 확인한다.
- `npm run verify:full`이 통과한다.

## 8. 후속 확장

- `@homeplan/catalog-adapter-schemaorg`
- `@homeplan/catalog-adapter-livart`
- `@homeplan/catalog-adapter-hanssem`
- CSV/스프레드시트 bridge
- protocol conformance CLI와 공개 fixture repository
- GTIN/KS 분류 및 업계 식별자 registry
- 공급사 서명, 증분 feed, 삭제 tombstone, 라이선스·권리 정책 자동 검사
