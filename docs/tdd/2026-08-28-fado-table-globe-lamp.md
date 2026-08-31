# IKEA FADO 구형 테이블 램프 형상 교정

- 계약: FADO는 일반 플로어 스탠드가 아니라 공식 200×200×290mm envelope 안의 구형 글래스 테이블 램프로 렌더한다. 모든 cylinder·sphere 치수는 양수이며 배치·충돌·선택은 기존 공식 치수를 유지한다.
- 테스트: `src/presentation/scene/tableGlobeLampProfile.test.ts`, `src/infrastructure/reference-data/data/brandCatalog.test.ts`, `e2e/retail-shapes.spec.ts`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/presentation/scene/tableGlobeLampProfile.test.ts`
- 종료 코드: `1`
- 실패: stub profile이 base radius 0, height -1과 반지름 0인 globe를 반환해 2개 테스트가 모두 실패했다. 기존 `floorLamp` 계산도 FADO 높이 290mm에서 기둥 높이 `h - 320 = -30mm`를 만들었다.

## GREEN

- 명령: `npx tsc --noEmit; npx vitest run src/presentation/scene/tableGlobeLampProfile.test.ts src/infrastructure/reference-data/data/brandCatalog.test.ts`
- 결과: 타입 검사와 10개 테스트 통과, 종료 코드 `0`.
- 구현: 양수 base와 공식 envelope를 채우는 타원형 유리 globe profile, 반투명 emissive material, 저강도 point light를 추가하고 FADO를 `tableGlobeLamp`로 매핑했다.

## REFACTOR

- 브라우저: 동일 위치·카메라에서 잘못된 원뿔형 스탠드가 구형 테이블 램프로 교체됐다. 전후 캡처는 `output/playwright/fado-shape-baseline.png`, `fado-shape-improved.png`이다.
- E2E: 실제 scene의 sphere scale, top 290mm, base 양수 높이와 WebGL context를 검증한다.
- 전체 검증: `npm run verify` 통과(57개 파일·251개 단위 테스트, statements 82.30%, branches 73.37%, functions 82.02%, lines 85.22%). `npm run test:preview -- --retries=0` 9개 통과. `npm run test:e2e -- --retries=0`은 외부 API 키가 필요한 2개를 명시적으로 skip하고 61개를 통과했다.
- 회귀 안정화: 전체 병렬 E2E에서 기존 워크스루 debug 좌표를 고정 시간 뒤 읽는 경쟁이 두 번 드러났다. 제품 assertion은 바꾸지 않고 `__hp3d_walk`의 실제 좌표·반경 준비 조건을 기다리도록 수정했으며 최종 전체 실행은 무재시도로 통과했다.
- 미확인: FADO 공식 이미지 재배포 권리는 확인하지 않았으므로 사진 자산은 추가하지 않았다.
