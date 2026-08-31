# KIVIK 다중 시점 타당성 A/B

- 계약: 독립된 전체 제품 시점 3개 또는 모델 최소 VRAM이 없으면 다중 시점 생성을 실행하지 않는다. 현재 생성 메시와 공식 참고 GLB는 동일한 공식 치수 비율 5% 게이트로 비교한다.
- 테스트: `src/application/generatedMeshExperiment.test.ts`

## RED

- 명령: `npx vitest run src/application/generatedMeshExperiment.test.ts`
- 종료 코드: `1`
- 실패: 준비도 함수가 실제 입력·모델·GPU를 평가하지 않고 항상 ready/0 views를 반환했고 후보 비교도 빈 배열이었다. 2개 실패.

## GREEN

- 명령: `npx vitest run src/application/generatedMeshExperiment.test.ts`
- 결과: 입력 시점, multi-image 지원, 한국 사용 가능 여부, GPU VRAM, A/B 비율 계산 4개 통과.
- 실제 명령: `npm run mesh:experiment:kivik`
- 결과: usable views 2개, GPU 12,288MiB로 `insufficient-distinct-product-views`, `insufficient-gpu-vram` 판정. TripoSR 52.1% 실패, IKEA DIMMA 참고 GLB 3.1% 통과.

## REFACTOR

- 변경: `--fetch`를 사용하면 고정 URL의 입력을 `.runtime/`에 내려받고 SHA-256을 검증한 뒤 같은 실험을 재현한다. 바이너리와 임시 reference record는 Git·published manifest에서 제외한다.
- 브라우저: 실제 Chromium에서 Draco GLB가 공식 치수 envelope 안에 렌더되는 것을 확인했다.
- 전체 검증: `npm run verify` 통과(56개 파일·246개 단위 테스트, statements 82.31%, branches 73.37%, functions 81.92%, lines 85.25%). production build와 DIMMA reference hash·경로 비노출 번들 검사도 통과했다.
- 미확인: IKEA 공식 GLB의 재배포·프로덕션 직접 사용 권리는 확인하지 않았다. TRELLIS 추론은 사전 조건 미충족으로 실행하지 않았다.
