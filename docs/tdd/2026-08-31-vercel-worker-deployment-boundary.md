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

## 최신 Vercel Services 회귀

- RED: Vercel CLI 59.10.0이 루트 Vite와 `services/triposr-worker`를 함께 자동 감지하고, 최상위 `buildCommand`·`outputDirectory`의 소유 서비스가 모호하다고 배포를 거절했다.
- GREEN: `vercel.json`의 `services.frontend`에 root, Vite framework, build command, output directory, SPA rewrite를 명시했다. GPU worker 서비스는 선언하지 않는다.
- 경계 검사는 최상위 build 설정 재도입, frontend 외 서비스 선언, frontend build 계약 변경을 자동 거절한다.
- `vercel deploy --dry -y`: Services preset으로 frontend 입력을 정상 산출하고 `services/triposr-worker`는 ignore됨을 확인했다.
- 전체 `npm run verify:full`에서 배포 경계 검사·build·bundle budget·production preview가 모두 통과했다.
