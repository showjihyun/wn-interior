# 주방 Object Attach/Detach와 실시간 가격

- 계약: 표면 장착 제품은 최종 스냅 좌표로 배치 가능성을 판단하고, 부모 이동·회전을 하위 Object가 함께 따른다. Detach는 임시 이동으로 시작해 다른 유효 표면에 재Attach하거나 Esc로 원래 관계를 복구한다.
- 가격 계약: placements가 추가·삭제될 때 참고 가격의 수량과 합계가 즉시 다시 계산되고 가격 탭 라벨에서도 확인된다.
- 테스트: `src/domain/installationAttachments.test.ts`, `src/domain/engine/drop.test.ts`, `src/presentation/state/store.test.ts`

## RED

- 명령: `npx vitest run src/domain/installationAttachments.test.ts src/domain/engine/drop.test.ts`
- 결과: 2개 실패.
- 실패: 부모를 이동해도 하위 싱크/수전 좌표가 그대로였고, 표면 스냅 결과는 방 안인데 원시 클릭점이 밖이면 `out-of-room`으로 거절했다.
- 명령: `npx vitest run src/presentation/state/store.test.ts`
- 결과: 신규 2개 실패. 부모 이동 추종과 `detachPlacement`가 구현되지 않았다.

## GREEN

- rigid transform을 attachment tree 전체에 전파해 상대 위치·회전·room을 보존한다.
- 방 경계·충돌·의존성 검사는 원시 바닥점이 아니라 최종 surface x/z/rotation을 사용한다.
- 이동 transaction이 전체 placement snapshot을 보존해 부모 이동 또는 Detach 취소도 한 번에 복구한다.
- surface Object는 드래그 중 지원 표면을 다시 탐색하며, 확정 직전에도 관계를 materialize해 분리 상태가 저장되지 않는다.
- store 가격 회귀는 900,000원 제품 추가 후 합계 900,000원, 삭제 후 0원을 확인한다.

## UX 검증

- 인스펙터에 부착 대상, 함께 이동하는 하위 Object, `분리해서 이동`, `Esc · 원래 연결로 복구`를 한 영역에 표시한다.
- 선택 Object 위에 `연결됨`/`연결 N` 상태를 표시하고 분리 중에는 `연결할 표면을 찾는 중`으로 전환한다.
- headed Playwright CLI에서 주방 chain 합계 682,000원 → 수전 삭제 후 552,000원 즉시 갱신, 콘솔 오류/경고 0.
- screenshot: `output/playwright/attach-ux-2026-08-31/attached-faucet.png`, `price-after-delete.png`.
- 전체 검증: unit 76파일·340테스트, E2E 81통과·외부 AI 2skip(retries 0), production preview 14통과.
