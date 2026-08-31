# TripoSR 로컬 모델 서비스와 IKEA 로컬 검역

- 계약: TripoSR 서비스는 localhost·고정 모델·GPU job 1개 경계에서 실행되고, 권리 미확인 IKEA 이미지는 quarantine까지 생성할 수 있지만 published manifest에는 들어갈 수 없다.
- 관련 테스트: `src/application/generatedMeshLifecycle.test.ts`, `src/infrastructure/generated-mesh/HttpGeneratedMeshWorker.test.ts`, `src/infrastructure/generated-mesh/glbValidation.test.ts`, 실제 `/health`·`/generate` 스모크.

## RED

- 명령: `npx vitest run src/application/generatedMeshLifecycle.test.ts`
- 종료 코드: `1`
- 실패 이유: `commercialUseAllowed=false`, `derivativeUseAllowed=true`인 로컬 검역 요청이 `source-rights-not-approved`로 거절되어 1개 실패, 3개 통과.
- 설치 진단 1: 첫 Docker build에서 `torchmcubes`가 불필요한 CUDA `9.0a`를 자동 선택해 CMake 실패.
- 설치 진단 2: 첫 서비스 기동에서 `onnxruntime 1.17.3`과 NumPy 2.2.6 ABI 충돌로 프로세스 종료.

## GREEN

- 같은 lifecycle 명령: 1개 파일·4개 테스트 통과. 로컬 검역은 derivative permission과 KR territory를 요구하고 commercial permission은 publish에서만 요구한다.
- Docker build: `TORCH_CUDA_ARCH_LIST=8.6`, `CMAKE_CUDA_ARCHITECTURES=86`으로 CUDA 확장 컴파일 성공.
- 서비스 health: `ready=true`, `device=cuda:0`, RTX 3060, 고정 upstream commit·model SHA 확인.
- 실제 생성: `npm run mesh:stage -- --product ik-kivik-3seat --worker-url http://127.0.0.1:8980 --rights <local-rights>` — 1.17MB GLB·58,532 triangles를 quarantine에 저장.
- negative publish: 공개 시도는 `rights-not-approved,silhouette-score-too-low,geometry-not-approved`로 실패했고 `published-manifest.v2.json`은 빈 상태 유지.

## REFACTOR

- TripoSR·torchmcubes·NumPy·OpenCV·ONNX 버전과 모델 커밋을 Dockerfile/requirements에 고정했다.
- IKEA JPG와 생성 GLB는 `.gitignore`·`.gitattributes export-ignore`·`THIRD_PARTY_ASSETS.md`로 MIT 코드 배포에서 분리했다.
- 전체 검증: `npm run verify` 통과(54개 파일·234개 단위 테스트, coverage·production build·bundle budget 포함), IKEA 실상품 E2E 1개 통과, production preview 8개 무재시도 통과.
- 미확인: 이 KIVIK 단일 이미지 메시의 품질은 게시 기준 미달이며 사람 검수 완료로 주장하지 않는다.
