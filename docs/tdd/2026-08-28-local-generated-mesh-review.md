# 로컬 생성 메시 인앱 검수 모드

- 계약: 명시적으로 선택한 `review-pending` KIVIK record는 개발 서버에서만 실제 방에 GLB로 배치·회전되고 `로컬 생성 3D · 검수 중`으로 표시되어야 한다. production/test build는 같은 로컬 설정이 있어도 격리 경로·hash·GLB를 노출하지 않고 공식 사진 기반 표현을 유지해야 한다.
- 테스트: `src/application/productVisual.test.ts`, `e2e/local-mesh-review.spec.ts`, `e2e/retail-texture.spec.ts`, `e2e/preview.smoke.spec.ts`, `scripts/check-bundle-budget.ts`

## RED

- 명령: `npx vitest run src/application/productVisual.test.ts`
- 종료 코드: `1`
- 실패: 정확한 product fingerprint의 로컬 검수 자산을 등록해도 resolver가 `local-review-mesh`가 아니라 기존 `decal`을 반환했다. 결과는 1개 실패, 3개 통과였다.

## GREEN

- 명령: `npx vitest run src/application/productVisual.test.ts`
- 결과: 4개 통과, 종료 코드 `0`.
- 구현: 로컬 자산 resolver, hash/length/quarantine 경계 검사, 개발 서버 전용 allowlist route, GLB 실측 envelope fitting, 상태 registry와 검수 배지를 연결했다.

## REFACTOR

- 경계: local review가 등록돼도 stale fingerprint는 기존 decal로 복구한다. 운영 빌드는 로컬 payload를 주입하지 않으며 bundle 검사에서 route, quarantine path, job ID, GLB hash, `.glb/.gltf` 산출물을 차단한다.
- 브라우저: `npx playwright test e2e/local-mesh-review.spec.ts --retries=0` 1개 통과. 실제 GLB HTTP 200, Three scene의 local review 노드, 공식 치수 2280×950×830mm, 15° 회전, WebGL context 정상과 page error 0건을 확인했다.
- 회귀: `npx playwright test e2e/retail-texture.spec.ts --retries=0` 1개 통과. 개발/운영 표현 분기 모두 유지한다.
- 운영: `npm run test:preview -- --retries=0` 8개 통과. KIVIK은 `공식 사진 기반 3D`이고 로컬 검수 배지는 0개였다.
- 수동 시각 검수: Playwright CLI의 실제 Chromium에서 KIVIK 메시, 검수 중 배지, inspector 공식 치수와 15° 회전을 확인했다. 캡처는 `output/playwright/local-kivik-in-room-top-rotated.png`이다.
- 전체 검증: `npm run verify` 통과(55개 파일·240개 단위 테스트, statements 82.13%, branches 73.06%, functions 81.74%, lines 85.07%). production build와 번들 비노출 검사도 통과했다. `npm run test:e2e -- --retries=0`은 외부 키가 필요한 2개를 명시적으로 skip하고 59개를 통과했다.
- 미확인: 사람의 게시 승인과 IKEA commercial permission은 여전히 완료되지 않았다. 이 모드는 게시 상태를 변경하지 않는다.
