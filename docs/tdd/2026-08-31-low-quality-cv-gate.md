# 저품질 CV 방 경계 적용 게이트

- 계약: 방 개수만으로 소형 도면을 차단하지 않는다. 방 폴리곤이 벽 외곽의 30% 미만을 설명하고 정규화 벽 밀도가 9를 초과할 때만 해칭·가구선 오염 가능성이 높은 저신뢰 blocker로 분류해 적용을 막는다.
- 테스트: `src/domain/engine/planReview.test.ts`, `e2e/cv.spec.ts`

## 문턱 사전 근거

- 고정 fixture 독립 계산:
  - Space Apartment 고급 설정: 커버리지 19.3%, 벽 밀도 10.74
  - 한국 33평: 커버리지 26.8%, 벽 밀도 8.54
  - FOCSA: 커버리지 35.2%, 벽 밀도 9.51
  - State House: 커버리지 28.5%, 벽 밀도 6.03
  - Paris 2방: 커버리지 20.2%, 벽 밀도 6.15이며 별도 복수 평면 게이트 대상
- 실제 브라우저 Space Apartment 경로는 커버리지 25.3%와 벽 밀도 9 초과를 기록했다. 브라우저 경로와 독립 계산 차이는 실제 브라우저 증거를 우선해 30% 결합 문턱에 반영했다.
- 한 지표만 낮거나 높은 정상 후보는 차단하지 않도록 AND 조건을 사용한다.

## RED

- 단위 명령: `npx vitest run src/domain/engine/planReview.test.ts`
- 종료 코드: `1`
- 실패 이유: 낮은 방 커버리지·과밀 벽선 fixture에서 `low-room-coverage` blocker가 `undefined`였다.
- 브라우저 명령: `npx playwright test e2e/cv.spec.ts -g "해칭으로 벽선"`
- 종료 코드: `1`
- 실패 이유: Space Apartment를 임계값 180·최소 벽 두께 6px로 조정한 50벽·2방 결과에 축척 경고만 표시되고 적용 버튼이 활성 상태였다.

## GREEN

- 단위 명령: `npx vitest run src/domain/engine/planReview.test.ts src/application/applyFloorPlanDraft.test.ts`
- 결과: 2개 파일·15개 테스트 통과. 낮은 커버리지이지만 저밀도인 정상 2방 fixture도 통과했다.
- 브라우저 명령: RED와 동일.
- 결과: 실제 fixture에 저품질 blocker와 원인 안내가 표시되고 적용 버튼이 비활성화되는 1개 테스트 통과.

## REFACTOR

- 변경: 방 polygon shoelace 면적, 벽 외곽 면적, 전체 벽 길이로 scale 불변 지표를 계산한다. 진단 속성은 E2E가 실제 검토 값을 직접 단정하는 데 사용한다.
- 관련 브라우저: `npx playwright test e2e/cv.spec.ts --workers=1` — 8개 통과.
- 전체 단위: `npm run test:coverage` — 65개 파일·288개 테스트 통과.
- 전체 브라우저: `npm run test:e2e` — 70개 통과·외부 AI 2개 조건부 skip.
- production preview: `npm run test:preview` — 14개 통과.
- 통합 기준선: `npm run verify` — 계약·타입·lint·format·288개 테스트·build·bundle budget 통과.
- 미확인/skip: 고정 10종 밖의 다양한 원룸·스튜디오 도면 오탐률은 실제 사용자 도면이 없어 미확인이다.
