# 실상품 사진 silhouette·종횡비 보존 투영

- 계약: 흰 배경 제거 뒤 alpha 32 이하의 haze는 crop 경계에서 제외하고, crop된 사진은 원본 종횡비를 바꾸지 않은 채 공식 W/H 또는 W/D envelope 안에 표시한다. 실측 배치·충돌·선택 치수는 변경하지 않는다.
- 테스트: `src/presentation/texture/productTextureMath.test.ts`, `src/presentation/texture/ProductImageDecal.test.tsx`, `e2e/retail-texture.spec.ts`, `e2e/preview.smoke.spec.ts`

## RED

- 명령: `npx vitest run src/presentation/texture/productTextureMath.test.ts`
- 종료 코드: `1`
- 실패: alpha 28의 배경 haze를 상품 경계로 포함했고, KIVIK·세로형 사진을 최대 W/H로 강제 변형했다. 3개 실패, 3개 통과.

## GREEN

- 명령: `npx vitest run src/presentation/texture/productTextureMath.test.ts src/presentation/texture/ProductImageDecal.test.tsx src/presentation/texture/ProductTextureEngine.test.ts`
- 결과: 10개 통과, 종료 코드 `0`.
- 구현: crop 최소 alpha를 32로 올리고 material alpha test를 0.12로 맞췄다. `fitImageWithinBounds`는 source aspect를 유지하는 contain scale만 계산한다.
- 회귀 감지: 첫 GREEN 시도에서 테스트용 `THREE.Texture.image=null` 처리를 놓쳐 ProductImageDecal 특성화 테스트 1개가 실패했고 안전 fallback을 추가했다.

## REFACTOR

- 브라우저: 동일 위치·카메라의 KIVIK에서 납작한 사진 띠가 실제 소파 비율의 cutout으로 복구됐다. 전후 캡처는 `output/playwright/decal-aspect-baseline-kivik.png`, `decal-aspect-improved-kivik.png`이다.
- 상품군 E2E: 인덕션(top), 수전(cutout), 싱크(top), 하부장(front), 커튼(curtain)의 plane/image aspect 일치와 공식 envelope 상한을 확인했다.
- 전체 검증: `npm run verify` 통과(56개 파일·249개 단위 테스트, statements 82.32%, branches 73.48%, functions 81.99%, lines 85.25%). `npm run test:preview -- --retries=0` 8개 통과. `npm run test:e2e -- --retries=0`은 외부 API 키가 필요한 2개를 명시적으로 skip하고 60개를 통과했다.
- 미확인: 사진 한 장으로 보이지 않는 측면·후면 형상이 정확해지는 것은 아니다. 그 영역은 계속 파라메트릭 형상이 담당한다.
