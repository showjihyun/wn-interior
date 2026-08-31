# Vercel 프런트·GPU worker 배포 경계

- 계약: Vercel 프런트 배포 입력에는 `services/**` GPU worker가 포함되지 않아야 하며, TripoSR worker는 기존 CUDA Docker 경로로만 배포한다.
- 테스트: `scripts/check-vercel-boundary.ts`

## RED

- 명령: `npm run test:vercel-boundary`
- 종료 코드: `1`
- 실패 이유: `.vercelignore missing: GPU worker must not enter the frontend deployment` 오류로 루트 배포 경계가 없음을 확인했다.

## GREEN

- 명령: RED와 동일.
- 결과: `Vercel 배포 경계 통과: services/** GPU worker 제외`, 종료 코드 `0`.

## REFACTOR

- 루트 `.vercelignore`에서 `services/**`, 모델 캐시, quarantine, 테스트 산출물을 제외했다.
- `npm run verify`에 배포 경계 검사를 추가해 후속 변경으로 worker가 프런트 배포에 다시 포함되지 않게 했다.
- `vercel services/triposr-worker`는 CPU 기반 Vercel Python builder에서 Git 네이티브 `torchmcubes`를 빌드하는 경로로, RTX 3060/CUDA·약 6GB VRAM·모델 캐시를 요구하는 현재 worker의 지원 배포 경로가 아니다. worker 문서에 Docker GPU 독립 배포 경계를 명시했다.
- 전체 `npm run verify:full`에서 배포 경계 검사·build·bundle budget·production preview가 모두 통과했다.
