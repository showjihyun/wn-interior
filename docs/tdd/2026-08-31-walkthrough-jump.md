# 워크스루 Space 점프와 가구 착지

- 계약: Space는 바닥 또는 가구 상단에 착지했을 때만 점프하고, 중력으로 내려오며, 배치 Object 상단을 발판으로 사용한다. 공중 이단 점프는 허용하지 않고 벽 충돌은 유지한다.
- 테스트: `src/domain/engine/walk.test.ts`, `e2e/walk.spec.ts`

## RED

- 명령: `npx vitest run src/domain/engine/walk.test.ts`
- 결과: 신규 4개 실패.
- 실패: 높이에 관계없이 가구가 수평 이동을 막았고, 점프·중력·가구 착지·발판 이탈 낙하 상태가 없었다.

## GREEN

- 초기 점프 속도 4,200mm/s, 중력 9,000mm/s²의 결정론적 vertical solver를 추가했다.
- `grounded`, `y`, `velocityY` 상태로 점프 rising edge만 허용한다.
- 발 높이가 Object top보다 높으면 수평 이동을 허용하고, 하강 중 top을 통과하면 정확히 상단에 착지한다.
- 가구 밖으로 걸어 나가면 바닥으로 낙하한다.
- 1·3인칭 카메라와 3인칭 avatar 모두 수직 위치를 공유한다.
- E2E: `Space로 점프하고 배치 Object 상단에 착지한다` 통과.
- 전체 E2E retries 0에서 81통과·외부 AI 2skip, production preview 14통과.
