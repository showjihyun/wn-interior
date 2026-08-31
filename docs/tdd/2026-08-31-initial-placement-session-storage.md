# 초기 배치 불변식과 접속 세션 저장소

- 계약 1: 초기 바닥 가구는 중심과 회전된 전체 footprint가 같은 방 안에 있고 다른 가구와 충돌하지 않을 때만 추가되며, 성공 시 `roomId`를 함께 저장한다. 거절된 배치는 placements·history·견적·배치안에 남지 않는다.
- 계약 2: 프로젝트는 현재 탭의 sessionStorage에 자동 저장되어 새로고침 후 복구되며, 같은 브라우저의 다른 탭 세션과 목록·현재 프로젝트를 공유하지 않는다.
- 테스트: `src/domain/engine/drop.test.ts`, `src/presentation/state/store.test.ts`, `src/compositionRoot.test.ts`, `e2e/app.spec.ts`

## RED

- 단위 명령: `npx vitest run src/domain/engine/drop.test.ts src/presentation/state/store.test.ts src/compositionRoot.test.ts`
- 종료 코드: `1`
- 실패 4건:
  - 중심만 방 안인 소파의 footprint가 경계를 넘어도 `{ ok: true }`였다.
  - 정상 초기 배치의 `roomId`가 `undefined`였다.
  - 방 밖 초기 배치가 `null` 대신 새 ID를 반환하고 상태에 추가됐다.
  - 프로젝트 저장 뒤 `sessionStorage['hp3d.index']`가 `null`이었다.
- 브라우저 명령: `npx playwright test e2e/app.spec.ts -g "같은 브라우저의 접속 세션"`
- 종료 코드: `1`
- 실패 이유: 같은 브라우저의 두 번째 탭이 첫 번째 탭의 `세션 A 전용` 프로젝트를 그대로 열어 세션 격리가 없었다.
- 참고: 최초 E2E 시도는 공통 `addInitScript`가 새로고침마다 저장소를 지우는 fixture 문제로 실패해 RED 증거에서 제외했다. 별도 페이지로 초기화 간섭을 제거한 뒤 위 공유 실패를 재현했다.

## GREEN

- 단위 명령: RED와 동일
- 결과: 3개 파일·24개 테스트 통과, 종료 코드 `0`
- 브라우저 명령: RED와 동일
- 결과: 1개 테스트 통과, 종료 코드 `0`
- 구현:
  - 회전된 floor footprint 네 꼭짓점을 같은 방 폴리곤 안에서 검증한다.
  - `addPlacement`가 방·footprint·충돌을 최종 상태에서 원자적으로 재검사하고 `roomId`를 저장한다.
  - 스토어 검사가 실패하면 pending 상태와 history를 확정하지 않는다.
  - 프로젝트 repository를 탭별 `sessionStorage` 구현으로 조합하고, AI 설정은 기존 localStorage에 유지한다.
  - 프로젝트 모달에 새로고침 유지·탭 종료 삭제·장기 보관용 내보내기를 명시한다.

## REFACTOR

- 변경: 고스트 미리보기와 확정이 같은 `canDropAt` 계약을 사용하도록 맞췄고, 테스트용 직접 배치는 실제 방 안의 비충돌 좌표로 교체했다. 실제 UI 클릭 테스트는 Three.js 카메라 투영으로 검증된 월드 좌표를 클릭한다.
- 전체 단위: `npm run test:coverage` — 65개 파일·284개 테스트 통과, 종료 코드 `0`.
- 전체 브라우저: `npm run test:e2e` — 68개 통과·외부 AI 2개 조건부 skip, 종료 코드 `0`.
- production preview: `npm run test:preview` — 14개 통과, 종료 코드 `0`.
- 통합 기준선: `npm run verify` — 계약 75개 파일, lint·format·coverage·build·bundle budget 통과, 종료 코드 `0`.
- 미확인/skip: OpenRouter 실서비스 2개는 키·한도 의존 조건부 skip이며 이번 로컬 배치·저장 판정에는 영향이 없다.
