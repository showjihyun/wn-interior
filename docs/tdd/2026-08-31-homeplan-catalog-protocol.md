# HomePlan Catalog Protocol 1.0·설치 의존성·IKEA 증분

- 계약: 국내 가구·인테리어 상품은 버전형 JSON protocol로 출처·실측·가격 기준·옵션·설치 capability를 교환하고, 문서는 원자적으로 Import되어야 한다. ALMAREN 수전은 같은 support chain에 METOD 하부장과 KILSVIKEN 싱크가 모두 있을 때만 배치되어야 하며, 제공자 삭제로 종속 제품을 고아로 남겨서는 안 된다.
- 테스트: `src/application/catalogProtocol.test.ts`, `src/application/projectEditing.test.ts`, `src/presentation/state/store.test.ts`, `src/infrastructure/reference-data/data/brandCatalog.test.ts`, `e2e/app.spec.ts`, `e2e/retail-texture.spec.ts`

## RED

- Protocol 명령: `npx vitest run src/application/catalogProtocol.test.ts`
- 종료 코드: `1`, 3개 실패.
- 실패 이유: 최소 스텁이 모든 문서를 `not-implemented`로 거절해 cm→mm 정규화, 치수 누락 경로, 중복 external ID를 표현하지 못했다.
- 의존성 명령: `npx vitest run src/presentation/state/store.test.ts -t "IKEA 수전은 같은 하부장 chain에 싱크가 있을 때만 배치한다"`
- 종료 코드: `1`.
- 실패 이유: KILSVIKEN의 `supportPlacementId`가 `undefined`였고, 하부장만 있어도 수전을 배치할 수 있었으며, 싱크 삭제로 종속 수전이 고아가 됐다.
- Import UI 명령: `npx playwright test e2e/app.spec.ts -g "국내 카탈로그 protocol JSON을 원자적으로 Import해 필터에 노출한다" --retries=0`
- 종료 코드: `1`.
- 실패 이유: `상품 카탈로그 JSON 가져오기` 입력이 없어 timeout으로 실패했다.
- IKEA 필터 RED: `도배·벽마감` 필터가 일반 `IKEA 제품이 없는 카테고리`만 표시해 공식 미판매 경계를 알리지 못했다.

## GREEN

- Protocol 단위: 리바트 cm·KRW·variant·출처 정규화, 치수 누락·중복 ID·JSON 구문 거절, shape 폴백 warning, IKEA surface/allOf 계약이 통과했다.
- Conformance: `npm run test:catalog-protocol` — JSON Schema ID와 리바트·IKEA 2개 feed, 4개 상품 통과.
- 의존성: 다른 하부장의 싱크는 수전 조건을 충족하지 않고, 같은 chain의 `base-cabinet AND sink`만 통과했다. 싱크·하부장 삭제는 종속 제품 안내와 함께 거절됐다.
- UI: 유효 feed는 `신규 1개`로 리바트 카드를 노출했고, 후속 무효 feed는 거절되면서 기존 카드를 보존했다.
- IKEA 증분: KNOXHULT 295.594.55, RUNNEN 604.767.35, PAX/HASVIK 194.297.56의 공식 치수·가격·용도를 노출했고, IKEA 도배 미판매를 명시했다.

## REFACTOR

- JSON Schema 2020-12와 application validator, domain capability graph, presentation Import UI를 레이어별로 분리했다.
- 원격 이미지는 출처 URL로만 보존하고, 해시·권리·로컬 URL이 없는 자산을 WebGL 텍스처로 자동 사용하지 않았다.
- 실브라우저: Import 성공 요약, 리바트 브랜드 칩, 11개 필터와 가로 스크롤 브랜드 바를 확인했고 콘솔 오류·경고는 0건이었다. 캡처는 `output/playwright/catalog-protocol-2026-08-31/` 경로에 두었다.
- 최초 전체 검증에서 application lines가 `88.65% < 90%`로 실패해 IKEA chain·JSON 구문·shape 폴백·upsert 분기 테스트를 추가했고 `90.90%`로 복구했다.
- 최종 검증: 단위 71개 파일·317개, 무재시도 E2E 78개, production preview 14개 통과. 외부 AI 2개는 기존 환경 조건부 skip.
- 미확인: 리바트·한샘 등의 실시간 DOM 추출기는 사이트별 약관·놀 변경·봇 정책을 검토할 별도 어댑터 범위다. v1은 정규화된 JSON feed Import까지만 검증했다.
