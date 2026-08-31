# 클린 아키텍처 전환 완료

- 계약: 모든 production 소스는 domain/application/infrastructure/presentation/composition 중 정확히 한 레이어에 속하고, 안쪽 레이어는 바깥 구현이나 브라우저 API를 참조하지 않으며, 사용자 편집·CV·저장 경로는 이전 동작을 보존한다.
- 핵심 테스트: `src/architecture/dependencyPolicy.test.ts`, `src/application/applyFloorPlanDraft.test.ts`, `src/application/createFloorPlanPreview.test.ts`, `src/application/projectEditing.test.ts`, `src/infrastructure/cv/HttpPlanVisionGateway.test.ts`, `src/presentation/state/moveTransaction.test.ts`

## RED

- 명령: `npx vitest run src/architecture/dependencyPolicy.test.ts`
- 종료 코드: `1`
- 실패 이유: `types.ts`, `storage/storage.ts`, `ai/client.ts` 우회 진입점 3개가 남아 있었고 production 소스/target 미분류 및 presentation→composition 허용이 확인됐다.
- 명령: `npx vitest run src/application/analyzeFloorPlan.test.ts src/application/projectService.test.ts`
- 종료 코드: `1`
- 실패 이유: 인증 실패가 의미 오류로 매핑되지 않고 `unauthorized` 원문으로 노출됐다.
- 명령: `npm run test:e2e`
- 종료 코드: `1`
- 실패 이유: 제거한 production `commit(fn)`을 E2E fixture가 호출했고, 주입된 브라우저 `fetch`가 바인딩되지 않아 `Illegal invocation`으로 CNN 경로가 폴백했다.

## GREEN

- 의존성 정책: 2개 테스트 통과.
- 단위/계약/레이어 타입 검사: `npm run verify` 통과, 46개 테스트 파일 계약 검사, 39개 파일·198개 테스트 통과.
- 커버리지: statements 90.20%, branches 79.25%, functions 86.44%, lines 93.35%; application/infrastructure/presentation-state 별도 기준 통과.
- 실제 브라우저: `npm run test:e2e` 57개 통과, 외부 API 키 필요 2개 skip.
- production preview: `npm run test:preview` 3개 통과.

## REFACTOR

- production 디렉터리를 네 레이어로 실제 이동하고 레거시 shim을 제거했다.
- composition singleton/service locator를 제거하고 `AppRuntimeProvider` 주입으로 변경했다.
- CV HTTP DTO·mask decode·timeout과 localStorage decoder를 infrastructure에 격리했다.
- CNN/Raster2Seq 캐시·폴백·초안 생성, 초안 적용, 편집 명령, 이동 history, variants, autosave, project document, quote를 application 유스케이스로 이동했다.
- 기하·개구부·충돌·보행·구조 projection·plan bounds 규칙을 domain으로 이동했다.
- production window debug 전역을 제거하고 development/test-mode bridge로 제한했다.
- 미확인: 실제 외부 AI 네트워크 2개는 키가 없어 skip됐으며 성공으로 판정하지 않는다.
