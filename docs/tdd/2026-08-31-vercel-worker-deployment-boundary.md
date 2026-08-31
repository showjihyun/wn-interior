# Vercel 프런트·GPU worker 배포 경계

- 계약: Vercel 프런트 배포 입력에는 `workers/**` GPU worker가 포함되지 않아야 하며, Vercel이 다중 서비스 자동 감지에 예약한 `services/` 디렉터리는 만들지 않는다. TripoSR worker는 기존 CUDA Docker 경로로만 배포한다.
- 테스트: `scripts/check-vercel-boundary.ts`

## RED

- 명령: `npm run test:vercel-boundary`
- 종료 코드: `1`
- 실패 이유: `.vercelignore missing: GPU worker must not enter the frontend deployment` 오류로 루트 배포 경계가 없음을 확인했다.

## GREEN

- 명령: RED와 동일.
- 결과: `Vercel 배포 경계 통과: reserved services/ 없음·workers/** 제외`, 종료 코드 `0`.

## REFACTOR

- 루트 `.vercelignore`에서 `workers/**`, 모델 캐시, quarantine, 테스트 산출물을 제외했다.
- `npm run verify`에 배포 경계 검사를 추가해 후속 변경으로 worker가 프런트 배포에 다시 포함되지 않게 했다.
- `workers/triposr-worker`는 CPU 기반 Vercel Python builder에 올리지 않는다. Git 네이티브 `torchmcubes`, RTX 3060/CUDA·약 6GB VRAM·모델 캐시를 요구하는 현재 worker는 Docker GPU 독립 배포 경로만 지원한다.

## 최신 Vercel Services 회귀

- RED 1: Vercel CLI 59.10.0이 루트 Vite와 `services/triposr-worker`를 함께 자동 감지하고, 최상위 `buildCommand`·`outputDirectory`의 소유 서비스가 모호하다고 배포를 거절했다.
- RED 2: `services.frontend`만 명시하면 build 상태는 READY가 되지만 부모/서비스 deployment output이 비어 production과 직접 URL이 모두 `404 NOT_FOUND`였다.
- GREEN: GPU worker를 예약 디렉터리 밖인 `workers/triposr-worker`로 이동하고 표준 단일 Vite `buildCommand`·`outputDirectory`·SPA rewrite를 복구했다.
- 경계 검사는 `services/` 재생성, `workers/**` ignore 제거, worker 경로 손실, services config 재도입, 단일 Vite build 계약 변경을 자동 거절한다.
- 전체 `npm run verify:full`에서 배포 경계 검사·build·bundle budget·production preview가 모두 통과했다.
