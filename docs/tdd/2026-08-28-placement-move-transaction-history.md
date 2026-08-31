# 배치 이동 transaction history 회귀 수정

- 계약: transient 배치 이동을 확정하면 Undo가 이동 전 origin으로 복원하고, 취소나 배치 실패는 history를 추가하지 않는다.
- 테스트: `src/presentation/state/moveTransaction.test.ts`

## RED

- 명령: `npx vitest run src/presentation/state/moveTransaction.test.ts`
- 종료 코드: `1`
- 실패 이유: 확정 후 Undo는 이동 완료 위치 `(4000, 3500)`에 머물렀고, 취소와 배치 실패는 각각 history를 `1`개 추가했다.

## GREEN

- 명령: `npx vitest run src/presentation/state/moveTransaction.test.ts`
- 결과: 테스트 파일 1개, 테스트 3개 통과, 종료 코드 `0`

## REFACTOR

- 변경: origin snapshot 생성과 rollback을 `application/placementMoveHistory.ts`로 분리하고 2D·3D 이동이 같은 store transaction을 사용하게 했다.
- 검증: `npm run test:contracts` 통과, 변경 파일 ESLint·Prettier 통과
- 전체 검증: `npm run verify` 통과, 39개 파일·198개 테스트 통과.
- 실제 pointer 검증: `npm run test:e2e`에서 2D/3D 이동·확정·취소·원위치 복귀 경로 통과.
