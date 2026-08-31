# 클린 아키텍처 적용 계획

## 목표

React, Zustand, 브라우저 API, 외부 AI/CV 서비스가 핵심 평면도·배치 규칙을 끌고 가지 않도록 의존성 방향을 안쪽으로 고정한다. 사용자 동작과 저장 데이터 형식은 유지하고, 교체 가능한 외부 구현은 포트 뒤로 격리한다.

## 현재 구조 검토 결과

- `types.ts`가 도메인 모델 역할을 하지만 모든 폴더가 루트 파일을 직접 참조해 레이어 경계가 드러나지 않는다.
- `engine`의 대부분은 순수 도메인 규칙이지만 `textures.ts`만 Three.js와 정적 재질 데이터에 결합돼 있다.
- `store/store.ts`가 편집 상태 외에 프로젝트 생성, 구버전 마이그레이션, 저장, ID·시간 생성까지 담당한다.
- `Toolbar.tsx`, `PlanVisionModal.tsx`, `ProjectsModal.tsx`가 `fetch`, `localStorage`, 구체 저장 어댑터를 직접 호출한다.
- `ai/client.ts`에는 요청 생성이라는 순수 로직과 외부 HTTP 어댑터의 책임이 섞여 있다.
- `cost/quote.ts`에는 견적 생성과 브라우저 다운로드가 함께 있다.
- UI/R3F 파일은 큰 편이지만 렌더링 전용 책임은 바깥 레이어에 있어야 하므로 이번 변경에서는 동작을 분할하기보다 의존성 경계를 먼저 바로잡는다.

## 목표 레이어와 의존성

```text
domain <- application <- infrastructure
   ^            ^              |
   +------------+-- presentation
                     compositionRoot
```

- `domain`: 단위가 mm인 모델, 기하·배치·보행·도면 해석 규칙. React, Zustand, Three.js, DOM, 네트워크, 저장소를 참조하지 않는다.
- `application`: 프로젝트 생명주기와 AI 도면 해석 유스케이스, 외부 의존성 포트. 도메인만 참조한다.
- `infrastructure`: sessionStorage 프로젝트 저장소, localStorage 설정 저장소, OpenAI 호환 HTTP, CV/Raster2Seq HTTP, 브라우저 다운로드 구현.
- `presentation`: React/R3F/SVG 화면과 Zustand 상태 어댑터. 구체 인프라는 직접 참조하지 않고 조립 루트가 제공한 유스케이스·포트를 사용한다.
- `compositionRoot.ts`: 실제 어댑터를 생성하고 애플리케이션과 프레젠테이션을 연결하는 유일한 위치다.

## 적용 단계

1. 도메인 모델을 `domain/model.ts`로 옮기고 기존 `types.ts` 우회 진입점은 제거한다.
2. 프로젝트 저장소, AI 설정 저장소, ID, 시계, AI/CV 게이트웨이를 애플리케이션 포트로 정의한다.
3. 프로젝트 초기화·마이그레이션·생성·가져오기·저장을 `ProjectService` 유스케이스로 이동한다.
4. AI 요청 재시도·오류 매핑·응답 정규화를 `AnalyzeFloorPlan` 유스케이스와 HTTP 어댑터로 분리한다.
5. 브라우저 저장소, fetch, 다운로드를 `infrastructure` 구현으로 이동한다.
6. Zustand를 팩터리로 바꾸고 의존성을 주입한다. 화면은 조립된 `useStore`와 포트만 사용한다.
7. 레이어 역참조를 잡는 의존성 정책 테스트와 ESLint 규칙을 추가한다.
8. 대상 테스트 RED/GREEN 후 계약 검사, 커버리지, 빌드, E2E/preview를 실행한다.

## 호환성과 비목표

- `Project.version = 1` 문서 형식은 유지한다. 프로젝트는 탭별 sessionStorage에 저장하며 장기 보관은 JSON 내보내기를 사용한다.
- UI 문구, 사용자 흐름, 2D/3D 렌더 결과, CV 알고리즘은 의도적으로 변경하지 않는다.
- 대형 React 컴포넌트의 시각적 하위 컴포넌트 분리는 이번 의존성 마이그레이션 이후 별도 단계로 다룬다. 먼저 외부 효과를 경계 밖으로 이동해야 이후 분할이 안전하다.

## 완료 조건

- 도메인과 애플리케이션 레이어에 React, Zustand, Three.js, DOM, localStorage, fetch 의존성이 없다.
- 프레젠테이션에서 인프라 구현 파일을 직접 import하지 않는다.
- 프로젝트 저장·가져오기와 AI/CV 호출이 포트로 교체 가능하다.
- 정적 의존성 테스트, 기존 단위 테스트, lint, format, coverage, build가 통과한다.
- UI 경계 변경에 대한 E2E와 preview 검증 결과를 기록한다.

## 최종 적용 구조

```text
src/
  domain/          # 모델, 기하/CV 계산, 배치·개구부·보행·구조 규칙
  application/     # 프로젝트/편집/히스토리/자동저장/AI·CV/견적 유스케이스와 포트
  infrastructure/  # HTTP DTO·timeout·mask decode, 브라우저 저장소 decoder, 정적 카탈로그
  presentation/    # React, Zustand 바인딩, SVG/R3F 렌더링, presenter
  compositionRoot.ts
  main.tsx
```

- `engine`, `data`, `cost`, `ai`, `store`, `ui`, `scene`을 예외 레이어로 간주하지 않고 책임에 따라 위 네 디렉터리로 실제 이동했다.
- `types.ts`, `storage/storage.ts`, `ai/client.ts` 호환 shim을 제거했다.
- presentation은 composition root를 import하지 않는다. `main.tsx`가 runtime을 만들고 `AppRuntimeProvider`로 주입한다.
- CNN/Raster2Seq capability, timeout, HTTP DTO, mask data URL 디코딩은 infrastructure에만 있다.
- segmentation/room prediction 캐시·폴백·초안 생성, 초안 적용, 편집 명령, 이동 transaction, Undo/Redo, 자동저장, JSON import/export는 application에서 수행한다.
- production은 Zustand/Three renderer를 `window`에 노출하지 않는다. 개발 및 `--mode test` 빌드에서만 E2E bridge를 활성화한다.
- `tsconfig.domain.json`과 `tsconfig.application.json`은 DOM 라이브러리 없이 내부 레이어를 별도 컴파일한다.
- 모든 production TypeScript 파일이 정확히 한 레이어로 분류되지 않거나 역방향/동적 import를 사용하면 의존성 정책 테스트가 실패한다.
