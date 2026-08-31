# 샘플 초기화 확인과 프로젝트 JSON round-trip

- 계약: 샘플 초기화는 정확한 확인 문구에서 승인한 경우에만 실행한다. 프로젝트 JSON은 평면도와 배치 Object의 전체 편집 상태 및 Attach 관계를 보존한다.
- 테스트: `src/presentation/sampleResetConfirmation.test.ts`, `src/application/projectDocument.test.ts`, `e2e/app.spec.ts`

## RED

- 명령: `npx vitest run src/presentation/sampleResetConfirmation.test.ts`
- 결과: 2개 실패. 확인 callback과 reset이 호출되지 않았다.
- 최초 round-trip E2E는 fixture의 존재하지 않는 벽지 ID 때문에 `Walls3D`가 중단되어 실패했다. 실제 외부 JSON에서도 가능한 경계라서 기본 벽지 폴백을 추가했다.

## GREEN

- `정말 샘플 초기화를 진행하시겠습니까?` 문구로 `window.confirm`을 호출한다.
- 취소 시 프로젝트를 유지하고, 확인 시에만 `resetToSample`을 실행한다.
- import input 값을 매번 비워 같은 JSON 파일도 연속해서 다시 불러올 수 있다.
- JSON 단위 round-trip은 벽·문·방 polygon·벽/바닥 마감·위치·높이·회전·색상·치수 override·`supportPlacementId`·커스텀 제품을 완전 동일 비교한다.
- 실제 UI는 다운로드한 파일을 다시 file input에 넣은 뒤 `plan`, `placements`, `customProducts` 전체가 동일함을 확인한다.
- E2E: 수전 배치, JSON round-trip, 샘플 초기화 Alert, Space 점프 4개를 retries 0에서 통과.
- 전체 검증: unit 76파일·340테스트, E2E 81통과·외부 AI 2skip(retries 0), production preview 14통과.
