# 세션 URL별 IndexedDB 영구 저장

- 계약: 새 접속은 고유 workspace URL을 가지며 프로젝트를 브라우저 IndexedDB에 workspace별로 저장한다. 탭을 닫은 뒤 같은 브라우저에서 같은 URL을 다시 열면 복구되고, 다른 workspace는 목록·프로젝트 ID·현재 값을 공유하지 않는다. IndexedDB 실패 시 현재 탭 sessionStorage로 폴백한다.
- 테스트: `src/infrastructure/persistence/BrowserSessionWorkspace.test.ts`, `src/infrastructure/persistence/IndexedDbProjectRepository.test.ts`, `src/infrastructure/persistence/LocalStorageProjectRepository.test.ts`, `src/compositionRoot.test.ts`, `e2e/app.spec.ts`

## RED

- 명령: `npx playwright test e2e/app.spec.ts -g "세션 URL을 다시 열면" --retries=0`
- 종료 코드: `1`
- 실패 이유: 첫 탭에서 `DB 영구 저장 우리집`을 만든 뒤 탭을 닫고 같은 URL을 새 탭으로 열자 `샘플 아파트 (34평형)`이 로드됐다. 기존 sessionStorage는 탭 종료 뒤 복구할 수 없었다.

## GREEN

- 대상 E2E: RED와 동일한 명령에서 1개 통과.
- 격리·복구 E2E: `npx playwright test e2e/app.spec.ts -g "같은 브라우저의 접속 세션|세션 URL을 다시 열면" --retries=0` — 2개 통과.
- 대상 단위: workspace 식별, DB-backed repository, workspace별 sessionStorage cache, composition root 4개 파일·16개 테스트 통과.

## REFACTOR

- 변경:
  - `?workspace=<UUID>`를 브라우저 세션 복구 키로 사용하고 sessionStorage에도 유지한다.
  - IndexedDB `homeplan3d` DB의 `projects` object store를 `workspaceId` index로 분리한다.
  - 앱 시작 전에 DB를 읽은 뒤 동기 메모리 repository를 구성해 기존 Zustand·ProjectService 계약을 유지한다.
  - 저장·삭제는 메모리와 workspace별 sessionStorage cache에 즉시 반영하고 IndexedDB write queue로 영속화한다.
  - 기존 세션 캐시와 DB가 충돌하면 `updatedAt`이 최신인 프로젝트를 보존한다.
  - IndexedDB 초기화 실패 시 기존 sessionStorage repository로 폴백한다.
- 통합 검증: `npm run verify` — 계약 79개 파일, 단위 69개 파일·308개 테스트, 타입·lint·format·coverage·build·bundle budget 통과.
- 전체 브라우저: `npm run test:e2e -- --retries=0` — 73개 통과, 외부 AI 2개 조건부 skip.
- production preview: `npm run test:preview -- --retries=0` — 14개 통과.
- 실브라우저: Chromium에서 workspace URL 생성, IndexedDB 안내, 동일 브라우저의 같은 URL 두 번째 탭 프로젝트 복구, 콘솔 오류·경고 0건을 확인했다. 로컬 화면 증거는 `output/playwright/indexeddb-project-storage.png`이다.
- 제한: 데이터는 같은 브라우저 프로필과 origin에서만 보인다. URL workspace 값은 계정 인증이나 공유 토큰이 아니며, 다른 기기 동기화·서버 백업·다중 사용자 동시 편집은 범위 밖이다.
