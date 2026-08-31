# KIVIK 고해상도 시점별 재생성 TDD 기록

- 계약: KIVIK 재생성은 동일 변형의 전체 제품 시점만 사용하고, 치수비 5%·실루엣 0.75를 같은 후보가 모두 통과할 때만 게시 후보로 선택한다.
- 테스트: `src/application/generatedMeshExperiment.test.ts`, `e2e/local-mesh-review.spec.ts`

## RED

- 명령: `npx vitest run src/application/generatedMeshExperiment.test.ts`
- 종료 코드: 1
- 첫 RED: 후보 선택 stub 때문에 신규 3개 테스트가 실패했다.
- 두 번째 RED: 수치가 좋은 후면 부분 확대 후보가 잘못 `gate-passed`로 선택되어 소스 증거 테스트 1개가 실패했다.

## GREEN

- 명령: RED와 동일
- 결과: 1개 파일, 8개 테스트 통과, 종료 코드 0.
- 구현:
  - 치수비·실루엣·소스 증거를 분리 평가하고 같은 후보가 모두 통과해야 선택한다.
  - 공식 이미지 SHA-256과 worker GLB·회전 뷰 SHA-256을 재검사한다.
  - 실제 POSITION/index bounds와 triangle 수로 후보를 비교한다.
  - 최선 실패 시도만 표준 `review-pending` record와 함께 quarantine에 보존한다.

## 실제 재생성 결과

- 환경: RTX 3060 12GB, TripoSR `107cefdc244c39106fa830359024f6a2f1c78871`
- 기존 저해상도 정면: 치수비 오차 52.09%
- 고해상도 정면: 치수비 오차 51.69%, silhouette IoU 0.9285, 58,373 triangles
- 후면 부분 확대: 수치상 43.43%지만 전체 제품 미노출로 소스 증거 게이트 제외
- 최종 상태: `rejected`, 미게시, 공식 사진+파라메트릭 폴백 유지
- 최종 검역 record: `artifacts/generated-mesh/quarantine/ik-kivik-3seat/kivik-multiview-ab-1788139621430/record.json`
- 실제 방 검증: 새 record를 주입한 `e2e/local-mesh-review.spec.ts` 1개 통과
- 시각 증거: `output/playwright/kivik-multiview-front-rejected.png`

## REFACTOR

- 전체 검증:
  - `npm run verify`: 통과. Vitest 63개 파일, 276개 테스트 통과. Statements 82.54%, Branches 72.72%, Functions 81.44%, Lines 85.30%.
  - `npm run test:e2e -- --retries=0`: 66개 통과, 외부 OpenRouter 의존 2개 skip.
  - `npm run test:preview -- --retries=0`: production preview 14개 통과.
  - 새 검역 record를 명시적으로 주입한 `e2e/local-mesh-review.spec.ts`: 1개 통과.
- 미확인/skip: 진짜 다중 이미지 모델 추론은 독립 전체 시점 1/3 및 VRAM 12/16GB로 실행하지 않았다.
