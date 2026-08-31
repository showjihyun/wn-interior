# 2D 스크린샷 무반응 버튼 제거

- 계약: PNG 스크린샷은 WebGL renderer가 존재하는 3D 모드에서만 활성화한다. 2D에서는 버튼을 비활성화하고 제한 이유를 title로 제공한다.
- 테스트: `src/presentation/screenshotAvailability.test.ts`

## RED

- 명령: `npx vitest run src/presentation/screenshotAvailability.test.ts`
- 결과: 2개 실패.
- 실패 이유: 기존 정책은 2D/3D 모두 활성 상태와 일반 `PNG 저장` title을 반환했다.

## GREEN

- 2D: `disabled=true`, `3D 화면에서만 PNG 스크린샷을 저장할 수 있습니다`.
- 3D: `disabled=false`, `현재 3D 화면을 PNG로 저장`.
- Toolbar가 mode별 정책을 사용해 무반응 클릭을 차단한다.

## 브라우저 검증

- 2D 전환 후 접근성 트리에서 `📷 스크린샷 [disabled]` 확인.
- 3D 복귀 후 버튼 활성화 및 `homeplan3d.png` download event 확인.
- 브라우저 콘솔 오류·경고 0.
