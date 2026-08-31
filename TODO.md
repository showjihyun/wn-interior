# 홈플랜 3D — 진행 관리 (TODO & GOAL)

> 이 파일이 프로젝트의 **단일 진실 원본(Single Source of Truth)** 입니다.
> 세션이 끊기면 이 파일을 읽고 마지막 체크포인트부터 이어서 진행합니다.
> 규칙: 작업 완료 시 `[ ]`→`[x]`, 새 발견 과제는 Backlog에 추가.

---

## 🎯 GOAL (최종 목표)

집 이사 앞둔 사용자를 위한 **웹 기반 3D 인테리어 시뮬레이터**

1. 도면 이미지(AI 해석) / 트레이싱 / 직접 그리기 → 평면도 생성
2. 평면도 → 실측(mm) 기준 3D 공간 자동 생성 (벽·문·창문·바닥·천장)
3. 실측 기반 카탈로그(바닥재·벽지·싱크대·가구·가전) 드래그 배치
4. 방별 마감재 교체, 배치안 A/B 비교, 저장/내보내기/스크린샷

## ✅ 확정 결정사항 (Deep Interview 2026-08-24)

| 항목        | 결정                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| 도면 입력   | AI 해석 + 트레이싱 + 직접 그리기 3종 전부                                |
| AI          | OpenAI 호환 API 어댑터 (baseUrl/key/model 설정화면 입력, 키 없으면 폴백) |
| 가구 렌더링 | 파라메트릭 박스 조합 (실측 재현, GLTF 확장 필드만 유지)                  |
| 대상 공간   | 국민아파트 평면(34평형대) 샘플 내장                                      |
| 실행        | 로컬 dev 중심 (`npm run dev`)                                            |
| UI 언어     | 한국어                                                                   |

## 🏗️ 아키텍처 요약

- Vite + React18 + TS + @react-three/fiber + drei + zustand
- 단일 데이터 소스: `Project{plan, placements}` → 2D(SVG)/3D(three.js) 모두 이것만 렌더
- 단위: 전부 mm 내부 저장, 화면에 cm/m 병기
- Undo/Redo: zustand 스냅샷 스택, 세션 URL별 IndexedDB 영구 저장 + sessionStorage 동기 캐시

---

## 📋 MILESTONES

### M0 셋업 ✅

- [x] Vite+React+TS+R3F 프로젝트 골격, npm install

### M1 코어 데이터

- [x] 타입 스키마 (types.ts: Wall/Opening/Room/Product/Placement)
- [x] 국민아파트 샘플 평면도 (samplePlan.ts)
- [x] 실측 카탈로그 28종 (catalog.ts) + 마감재 정의 (materials.ts)

### M2 스토어 & 엔진 ✅

- [x] zustand 스토어: 배치/선택/Undo-Redo/sessionStorage 자동저장
- [x] geom.ts: 벽 스냅/AABB 충돌/point-in-room 유틸
- [x] textures.ts: 절차 텍스처(마루/장판/타일/벽지) 실규격 반복

### M3 3D 씬 ✅

- [x] 벽 렌더 + 문/창문 개구부 슬라이스 (프레임·짐·유리 포함)
- [x] 바닥(방 폴리곤)+조명, OrbitControls, 아이소/탑뷰 프리셋
- [x] 파라메트릭 가구 셰이프 27종 (shapes.tsx)
- [x] 배치 엔진: 고스트 프리뷰/클릭 배치/드래그 이동/벽자석/R회전/충돌 하이라이트

### M4 UI 셸 ✅

- [x] 툴바(2D↔3D, undo/redo, 저장, 스크린샷, AI 임포트, 설정)
- [x] 카탈로그 패널(8카테고리 + 커스텀 제품 실측 등록)
- [x] 인스펙터(치수/색상/회전/설치높이 슬라이더/좌표 입력)
- [x] 마감재 패널(방별 바닥재/벽지 6+6종)

### M5 2D 편집기 ✅

- [x] SVG 뷰어(벽/문/창/방 라벨/치수선) + 가구 탑뷰 드래그
- [x] 벽 그리기(연속)/끝점 드래그/삭제, 두께 선택
- [x] 문·창문·출입문 클릭 배치 + 폭/실하단 조절 패널
- [x] 이미지 트레이싱(배경 이미지 + 두 점 스케일 캘리브레이션)

### M6 AI 도면 해석 ✅ (어댑터 완성)

- [x] OpenAI 호환 Vision 어댑터 → FloorPlan JSON 변환 (baseUrl/key/model 설정)
- [x] 프롬프트/스키마 검증 + 결과 로드 → 2D 보정 플로우 안내

### M7 마무리 ✅

- [x] 프로젝트 JSON export/import, PNG 스크린샷
- [x] tsc 오류 0 / vite build 성공 / dev 서버 검증(localhost:5173 HTTP 200)

---

## 📌 Backlog (이후 확장)

- 커튼/블라인드, 조명 밝기 시뮬, 견적서(배치 제품 합계) 기능

### M8 확장 (Backlog에서 승격) ✅

- [x] ① 1인칭 워크스루 (시점 높이 1600mm, 드래그 시선 + WASD 이동 + Shift 달리기, 벽 충돌 차단)
- [x] ② 배치안 A/B 비교 (JPEG 썸네일 스냅샷 저장/적용/삭제, 적용 시 Undo 가능)
- [x] ③ GLTF 모델 지원 (Product.modelUrl + 실측 높이 자동 피팅·그림자 + 커스텀 등록 UI)

### M9 테스트 (TDD + E2E) ✅

- [x] Vitest 도입 (jsdom) — RED→GREEN 사이클로 `ai/normalizePlan.ts` 신규 구현
- [x] 단위테스트 29개: geom(스냅/충돌/폴리곤), store(Undo·배치안·커스텀), AI 응답 정규화
- [x] Toolbar AI 파싱을 normalizeAiPlan으로 리팩터링 (검증된 로직 단일화)
- [x] Playwright E2E 5개: 로드/배치플로우/2D 벽그리기/배치안/AI모달
- [x] **E2E가 실버그 2건 발견·수정**: ① 배치 직후 setPending(null)이 선택을 지워 인스펙터가 비는 문제
      ② 고스트 히트 플레인 visible=false → 레이캐스트 제외 위험 (투명 머티리얼로 교체)
- [x] 헤드리스 WebGL: launchOptions에 SwiftShader 플래그 추가

### M10 TDD 고도화 + 브라우저 직접 실행 검증 ✅

- [x] TDD RED→GREEN: 벽스냅 로직을 순수함수 `engine/geom.ts · snapPlacement`로 추출 (실패테스트 5개 선행)
- [x] 회귀테스트 추가 (setPending 선택 보존 등) → **단위 36개 전부 통과**
- [x] E2E 15개로 확장 (회전/색상/설치높이/삭제·Undo/커스텀등록/마감재/벽그리기/문배치·폭조절/배치안·Undo/자동저장·리로드/다운로드/시점프리셋/AI모달)
- [x] E2E RED→GREEN에서 **실버그 추가 발견·수정**:
      ③ 2D 벽 히트라인이 무조건 stopPropagation → 문/창 도구로 벽 위 클릭 시 개구부 배치 불가 (선택 모드에서만 가로채도록 수정)
      ④ 개구부 선택이 회전 심볼 bbox 중심 클릭에 실패 → data-testid + rect 정밀 클릭으로 해결
- [x] **실브라우저 직접 실행(15단계 워크스루 + 스크린샷 15장)** → **치명 버그 발견·수정**:
      ⑤ R3F 기본 카메라 far=1000 vs mm 씬 → 3D 지오메트리 전체 잘림(빈 화면). far=300000 설정으로 해결
- [x] `npm run shots` — 워크스루 스크립트 상시 실행 가능, 콘솔 에러 0 확인

### M11 실제 브랜드 제품 DB (한샘·LG전자) ✅

- [x] 계획: 웹 리서치 → JSON DB → 카탈로그 통합 → 배치 검증
- [x] 리서치: 한샘(주방·수납·침실 대표 제품), LG전자(TV·코드제로·디오스·퓨리케어) 실측 규격 + 출처 URL 수집
- [x] 스키마 확장: Product에 brand/model/sourceUrl/sourcedAt 필드 (출처 추적 가능한 DB)
- [x] 데이터 파일화: src/data/brands/{hanssem,lg}.json — 코드 수정 없이 DB 교체 가능
- [x] 신규 셰이프: 로봇청소기(원형), 공기청정기(타워), OLED TV(슬림+스탠드)
- [x] 카탈로그 UI: 브랜드 필터 + 제품 카드에 브랜드/모델명 표기
- [x] TDD: 카탈로그 병합/검증 로직(mergeBrands) 실패테스트 → 구현
- [x] E2E: 브랜드 필터 → 한샘 싱크대 벽부착 배치 / LG 로봇청소기 배치 → 실측 확인
- [x] 실브라우저 스크린샷 검증

> ⚠️ 데이터 유의: 규격은 공식 몰·쇼핑몰 공개 스펙 기준. 옵션(모듈/설치형)에 따라 달라
> 수 있으므로 sourceUrl로 출처를 남기고, 시공품은 구매 전 실측 권장 문구 표기

### M12 브랜드 DB 대확장 (9개 브랜드) ✅

**브랜드·카테고리 매트릭스 (각 2~3곳):**

| 카테고리 | 브랜드                                              |
| -------- | --------------------------------------------------- |
| 가전     | LG전자 ✓(M11), 삼성전자(냉장고·The Frame TV·세탁기) |
| 전체가구 | 한샘 ✓(M11), IKEA(소파·침대·옷장·책장·테이블)       |
| 침대     | 시몬스, 에이스침대, IKEA MALM                       |
| 식탁     | 일루미, 한샘, IKEA                                  |
| 조명     | 담소사이, IKEA(FADO 등)                             |

**단계:**

- [x] 1) 리서치: 공식 스펙 + sourceUrl 수집 완료
      · 삼성: 비스포크 냉장고 912×1853×930 / The Frame 65 (스탠드 1454×876×294, 벽걸이 1454×831×38)
      · IKEA: KIVIK 2280×950×830 / MALM 퀸 1660×2110 / BILLY 800×280×2020 / LACK 1180×780×450 / PAX 2000×600×2010 / NORDEN 1250×740×740 / FADO 200×200×290
      · 시몬스: QE 매트리스 1500×2000×370 → 프레임 외경 1600×2110 / LK 1800×2185
- [x] 2) JSON DB: brands/{samsung,ikea,simmons}.json 신규 + 한샘·LG (총 5파일 24종)
- [x] 3) brandCatalog.ts FILES 등록 (검증 파이프라인 재사용)
- [x] 4) UI: 브랜드 칩 동적 추출 getBrandList() (TDD — 실패테스트 선행)
- [x] 5) 셰이프: 기존 재사용 (bed/wardrobe/diningTable/coffeeTable/box/floorLamp)
- [x] 6) E2E 3건 추가: 브랜드 칩 동적 생성 / KIVIK 배치+시몬스 실측 / The Frame wall-mount
- [x] 7) 실브라우저: 브랜드 믹스 배치안 10제품 스크린샷 (19~21) — 전부 정상 렌더
- [x] 8) 회귀: 단위 44 / E2E 22 / tsc / build / 콘솔에러 0

**백로그 (데이터 추가):** 조명 전문몰(담소사이·루미드)·에이스침대·일루미는 스펙 페이지
자동 수집이 어려워 수동 확보 필요 — JSON 하나 추가하면 파이프라인이 자동 반영

### M13 UX 고도화 + AI 실측 ✅

- [x] A. 드래그 중 카메라 차단 — pointerdown 즉시 controls.enabled=false, E2E 카메라 불변 단정
- [x] B. 이동 완료 버튼 (객체 우측상단 Html) + canDropAt 순수함수 TDD (방 밖/충돌/러그 예외/wall-mount 제외)
      · 확정 실패 시 Toast '공간 부족' + 원위치 / 신규 배치(고스트)도 동일 검사
      · **버그 수정**: 단순 클릭 선택이 이동모드로 진입해 드래그 막히던 문제 → 드래그 임계값(8px) 초과 시에만 진입
      · **버그 수정**: 벽 바깥쪽 클릭 시 노멀이 바깥을 향해 배치 거부 → 실내 쪽 자동 반전 (TDD)
- [x] C. 가격 탭 (배치/마감재/가격): buildCostReport TDD, 수량 집계·소계·합계, 미확인(견적) 분리, 출처 ↗ 새창
      · 가격 데이터: R5 900,000 / 에어로타워 929,000 / MALM 퀸 434,000 (출처 시점 명기)
      · **버그 수정**: validateBrandProduct가 price/priceNote 누락 + JSON BOM 문제 해결
- [x] D. OpenRouter AI 연동 (TDD: buildChatRequest/parseChatResponse 60테스트) + 설정 프리셋(OpenRouter·OpenAI)
      · 실제 키 스모크: 인증·통신·오류처리 검증 (402 크레딧/429 한도 메시지 친절화)
      · 무료 vision 모델(gemma-4) 해석 플로우: 한도 소진 시 skip — 회복 후 `npx playwright test e2e/ai.spec.ts` 재실행
- [x] E. LAN 접속: host:true → http://10.10.12.108:5173 HTTP 200 확인
- [x] F. 회귀: 단위 60 / E2E 27 / tsc / build 통과

### M14 오늘의집 벤치마크 반영 ✅

- [x] 벤치마크 문서: docs/BENCHMARK-ohouse.md
- [x] ① 단축키 `1`(2D)/`3`(3D)
- [x] ② 카탈로그 카드: 색상 스와철 + "배치 N개" 뱃지
- [x] ③ 인스펙터 치수 오버라이드 (유사 제품 + 실측 조정 워크플로우, TDD: resolveDims)
- [x] ④ 조명 강도 슬라이더
- [x] ⑤ 회귀 + 문서
- 백로그: 접이식 치수 · 공유 링크 · 다중선택 그룹 이동

### M15 CV 도면 변환 엔진 (LLM 없이 2D→3D) ✅

- [x] TDD: planVision 코어 — 이진화 / H·V 런-밴드 벽 추출(얇은 치수선 필터) / 갭→문 후보 /
      축척 추정(외벽 두께 기준) / 플러드필 방지 폴리곤 + Moore 추적 + RDP 단순화
- [x] 합성 마스크 단위테스트 6종 (두꺼운 벽 검출·얇은 선 무시·문 갭·축척·방 폴리곤·전체 파이프라인)
- [x] PlanVisionModal: 업로드 → 슬라이더 4종(임계값/최소두께/최소길이/외벽두께mm) →
      디바운스 실시간 오버레이 프리뷰(방 채움·벽 빨강·문 파랑) → 변환 적용
- [x] normalizeAiPlan 검증 파이프라인 재사용 (id 부여·무효 제거) + opening offset 재계산
- [x] E2E: 합성 도면 PNG → 벽 6·방 2·문 1 자동 검출 단정 (네트워크 불필요, 결정론)
- [x] **버그 수정 2건**: ① 닫힌 경계를 열린 RDP로 처리해 방 폴리곤 전부 탈락(절반 분할로 수정)
      ② 문 갭을 축척 확정 전 px 범위로 필터 → 방 플러드필 새서 방 0개(갭 전부 기록 후 mm 필터로 수정)
- [x] apply 예외 삼킴 방지 — 실패 시 상태 표시 (검증 선: 실패를 삼키지 않는다)

검증: 단위 70 passed / E2E 32 passed / tsc OK / build OK (2026-08-25)

### M18 백로그 소화 (커튼·견적서) + CV 실도면 벤치마크 ✅

- [x] 커튼·롤스크린 제품 추가 (창가 배치, 주름/롤 셰이프 신규)
- [x] 견적서 내보내기: buildQuoteText TDD (방 면적·마감재·제품 합계 .md 다운로드, 가격 탭 버튼)
- [x] 리서치: Ahmed 등 두께 분리 기법·Manhattan 가정(Raster-to-Vector)·Deep Floorplan 후처리(경계 플러드필) 확인 → 고전 4기법 선정
- [x] CV 개선(TDD 6종): 소형 연결요소 제거, Otsu, 모폴로지 클로징, 직교 스냅 + 반전 자동감지(invertGray)
- [x] 웹 실도면 다운로드: Wikimedia FOCSA 아파트 평면도 (551×711) — 추가 이미지는 429 제한으로 재수집 필요
- [x] cv-benchmark: FOCSA 실측 — 벽 44·방 3·문 22·축척 16.7mm/px·52ms (Otsu 138 + 자동 반전 적용)
- [x] 회귀 + 문서
- [x] **버그 수정**: newProject가 모드를 전환하지 않아 빈 도면이 3D로 열리던 문제 → 2D로 시작

검증: 단위 93 / E2E 38+벤치마크 통과 / tsc OK / build OK (2026-08-25)

### M20 3D 외곽 치수선 + CV→3D 전 과정 브라우저 검증 ✅

- [x] 3D 치수선: 도면 외곽 남측(가로)·동측(세로) 건축 도면 스타일
      (연장선·끝눈금·mm 숫자 라벨, 📐 토글) — 샘플 10,600/7,400 정확
- [x] CV 모달 좌(원본)/우(변환 오버레이) 분할 레이아웃
- [x] CV→2D→3D 전 과정 브라우저 검증 (합성+FOCSA 실도면):
      합성 — 벽6(200mm 정확)·방2·문1, 3D 렌더 픽셀 검증 통과
      FOCSA — 파라미터 그리드 탐색으로 denoise 800 최적화 → 방 3→5, 바닥 +52%
- [x] 발견 버그 수정: apply() 누락 파라미터(denoise/morph/ortho)

검증: 단위 93 / E2E 41 / tsc OK (2026-08-25)

### M21 보완 검토 (자동 스캔 + 감사) ✅

- [x] 시크릿 스캔: git 추적 파일 유출 0건
- [x] alert/@ts-ignore 잔여 0건, test.skip 2건(환경 조건부 — 합법)
- [x] **중대 버그 수정(TDD)**: loadProject가 projectId를 갱신하지 않아
      AI 해석·CV 적용·가져오기 시 현재 프로젝트를 덮어쓰던 문제
      → 별도 프로젝트로 저장 + 기존 보존 (회귀 테스트 2종)
- [x] 콘솔 로그 정리: 6건 모두 벤치마크 리포트용(의도적)으로 유지

검증: 단위 95 / E2E 41 / tsc OK / build OK (2026-08-25)

## 📌 향후 권장 (우선순위)

1. 이사 예정 사용자 3~5명 사용성 검증 (`docs/USER-VALIDATION.md`) — 외부 모집이 어려워 보류
2. [x] 실도면 벤치마크 10종으로 확대 (FOCSA + 한국 33평 + Wikimedia 공개 라이선스 8종)
3. 색상·반전·다층 실패 유형 기반 CV 벽·방 검출 개선
4. 읽기 전용 공유 링크 · 계정별 프로젝트 DB 어댑터
5. 배포 및 운영 환경 검증은 사용자 요청에 따라 후순위

### M22 개발 기준선 + AI/CV 정리 ✅

- [x] 깨진 package.json 복구, ESLint·Prettier 스크립트와 설정 도입
- [x] 폐기 AI 모델 요청 차단 및 Gemma 4 무료 vision 모델로 기본값·프리셋 교체
- [x] 한국 33평 실도면 fixture 추가, 실도면 최소 품질 기준선과 실행 리포트 분리
- [x] 방 0~1개 검출 시 저면적 재탐색 — 한국 도면 방 1→6개 개선
- [x] 도면 전체 가로 실측값 기반 축척 보정 — 11,800mm 도면 원시 오차 72.1%→0%
- [x] 실브라우저 검증에서 파비콘 404와 3D 치수 라벨 모달 침범 수정
- [x] 최종 회귀: 단위 99 / E2E 45 passed + 실API 2 skipped / lint / format / build 통과

### M23 사용자 검증 ← **다음 진행**

- [x] 20분 과업·성공 지표·종료 질문 문서화 (`docs/USER-VALIDATION.md`)
- [x] 실제 사용자 대체가 아닌 가상 페르소나 3명 휴리스틱 사전 점검 (`docs/evidence/PERSONA-USER-VALIDATION-2026-08-31.md`)
- [x] 페르소나 P1 반영: 추정 축척 3D 우회 차단 + 2D 원본 오버레이·4항목 검수 게이트
- [x] 페르소나 P1 반영: 낮은 방 커버리지 + 과밀 벽선 저품질 CV 적용 게이트
- [x] 페르소나 P2 반영: CNN 폴백 사용자 안내와 접힌 진단 상세 분리
- [x] 페르소나 P2 반영: 동일 fingerprint 배치안 A/B 중복 저장 경고
- [x] 동일 페르소나·입력의 2차 회귀 검증과 1차 이슈 6종 수정 확인
- [x] M30 집중 페르소나 3차 검증: 수정 완료·수정 불필요 근거 저장/복구, 저품질 선행 차단
- [x] 3차 P2 후속: 2D SVG 벽·방·문 키보드 선택·접근 이름·일관된 히트 영역·포커스 표시
- [x] 사용자 UX 반영: 카탈로그 배치 대기 중 기존 오브젝트 선택·hover 잠금 + Esc 일반 선택 복구
- [x] 사용자 UX 반영: IKEA 수전 싱크대 상판 스냅 배치 + 3D 회전·확대·축소 UI
- [ ] 이사 예정 사용자 3~5명 모집 및 본인 도면 확보
- [ ] 관찰 세션 실행, 완료 시간·힌트·수동 보정 수 기록
- [ ] 반복 이슈를 P0~P3로 분류하고 다음 개발 범위 확정

### M30 근거 기반 2D 검수·확인 플로우 ✅

- [x] 모든 CV 초안은 2D 검수 근거를 저장하기 전까지 모달·툴바·단축키의 3D 진입 차단
- [x] 벽·방·문·실측 치수 중 대표 요소 선택 + 도면 위 주황색 강조
- [x] `수정 완료` / `수정 불필요` 판정과 5자 이상 검수 근거 입력
- [x] 대표 요소별 fingerprint 기준으로 선택 요소를 바꾸지 않은 `수정 완료` 판정 차단
- [x] 대표 요소·판정·근거·완료 시각·도면 fingerprint를 프로젝트에 자동 저장하고 재열기 복구
- [x] 근거 없는 과거 `completed` 상태는 완료로 신뢰하지 않고 다시 검수
- [x] TDD·전체 E2E·production preview·실브라우저 시각 검증

### M31 세션별 IndexedDB 영구 저장 ✅

- [x] 새 접속마다 무작위 `workspace` URL 키 생성, 새로고침 시 동일 키 유지
- [x] IndexedDB `homeplan3d/projects` 저장소에 workspace별 프로젝트 CRUD 영구 저장
- [x] sessionStorage 동기 캐시도 workspace별 namespace로 분리해 교차 오염 차단
- [x] 탭 종료 후 같은 브라우저에서 같은 세션 URL을 열면 프로젝트 목록·현재 값 복구
- [x] 다른 workspace URL은 같은 프로젝트 ID도 공유하지 않음
- [x] 기존 sessionStorage 데이터를 IndexedDB로 최신 `updatedAt` 기준 병합·이관
- [x] IndexedDB 사용 불가 시 현재 탭 sessionStorage로 안전 폴백하고 UI에 제한 표시
- [x] TDD·전체 E2E·production preview·실브라우저 검증

제한: 브라우저·origin 로컬 DB이므로 계정 간 또는 다른 기기와 동기화되지 않는다. 서버 계정 저장은 기존 `ProjectRepository` 어댑터를 원격 DB 구현으로 교체하는 별도 범위다.

- [x] Vercel 프런트 배포에서 `services/**` GPU worker 제외 + 명시적 `services.frontend` + 배포 경계 자동 검사

### M32 HomePlan Catalog Protocol 1.0 + 설치 의존성 + IKEA 증분 ✅

- [x] 국내 가구·인테리어 상품 교환용 버전형 JSON Schema·TypeScript validator
- [x] provider·외부 ID·출처·치수·단위·가격 기준·옵션·소재·자산·설치 capability 규격
- [x] cm/m→mm, taxonomy→내부 카테고리, 미지원 shape→box warning 정규화
- [x] 원자적 JSON Import·경로별 오류·ID 갱신·Undo/Redo·자동저장 경계
- [x] `allOf`/`anyOf` + `project`/`support-chain` 의존성과 제공자 삭제 보호
- [x] METOD 하부장 → KILSVIKEN 싱크 → ALMAREN 수전 AND 의존 체인
- [x] Catalog Protocol conformance: 리바트 소파 + IKEA 주방 chain 2개 feed·4개 상품
- [x] IKEA KNOXHULT 주방, RUNNEN 야외용 조립마루, PAX/HASVIK 맞춤형 옷장 공식 증분
- [x] `도배·벽마감`, `바닥마감`, `붙박이·맞춤수납` 필터와 IKEA 도배 미판매 안내

### M33 Schema.org·OpenGraph 오프라인 카탈로그 어댑터 ✅

- [x] Schema.org `Product`/`Brand`/`Offer`/`QuantitativeValue` JSON-LD 변환
- [x] `@graph`·배열 JSON-LD와 깨진 블록 후속 탐색
- [x] JSON-LD가 없는 리바트형 OpenGraph title·image·price 폴백
- [x] W/D/H·taxonomy·installation 누락 시 override 없이 배치 상품 생성 거절
- [x] 저장 HTML/JSON-LD + adapter config → Protocol 1.0 JSON CLI
- [x] 리바트 최소 HTML fixture·override·생성 feed conformance

### M34 한샘·리바트 override + CSV/XLSX bridge ✅

- [x] 한샘·리바트 전용 web adapter override 템플릿
- [x] 공통 31컬럼 CSV/XLSX 상품 입력 규격과 브랜드 기본값 config
- [x] XLSX products/guide 시트, 필터·고정창·드롭다운·필수값 강조
- [x] BOM·quoted CSV·복수값·boolean·단위·설치 의존성 변환
- [x] 계산 cache 없는 XLSX 수식 거절과 Windows UTF-8 subprocess 경계
- [x] 한샘·리바트 CSV/XLSX Protocol 결과 동등성 conformance

### M35 브라우저 CSV/XLSX 카탈로그 Import ✅

- [x] 좌측 카탈로그 JSON·CSV·TSV·XLSX 공통 파일 선택
- [x] 한샘·리바트 브랜드 preset 자동 결정과 혼합 브랜드 거절
- [x] 배포 화면에서 XLSX/CSV 템플릿 직접 다운로드
- [x] 10MB·필수 헤더·확장자·XLSX 수식 안전 경계
- [x] XLSX parser 동적 로드로 초기 작업면 번들 분리
- [x] 기존 Protocol validator·원자적 Import·Undo/Redo·자동저장 경로 재사용

### M24 2D→3D 정확도 2,200건 감사 ✅

- [x] CubiCasa5K 실제 도면 1,000건 층화 표본 추출 + 이미지/SVG CRC 검증
- [x] 합성 도면 1,200건(깨끗함·노이즈·균열·반전·혼합) 결정론 평가
- [x] 방 IoU 0.5 매칭 F1·벽 픽셀 F1·문 개수 일치·축척 오차·처리시간 기록
- [x] 공식 CubiCasa 좌표 규칙 교차 확인 후 전체 재평가
- [x] 대표 성공/실패 사례를 실브라우저 2D→3D로 재현, 콘솔 오류 0 확인
- [x] 근거: `docs/evidence/CV-ACCURACY-AUDIT.md` + 전체 2,200행 JSON

판정: 실제 도면 변환 성공률 94.3%지만 방 개수 정확 일치 7.7%, 방 F1 30.68%, 벽 F1 54.09%.
현재 기능은 **자동 완성이 아닌 사용자 보정 전제 초안 생성**으로 제한한다.

### M25 평가 감사 + 로컬 CNN 하이브리드 ✅

- [x] CubiCasa 공식 House 로더 100건 대조: 방 100/100, 벽 97/100 일치
- [x] 128↔256 평가 격자 민감도 감사: 집계 평균 차이 방 0.18%p·벽 0.09%p
- [x] 개발 100 / 홀드아웃 900 고정 분리, 고전 CV 프로필 8종+신경망 하이브리드 비교
- [x] 논문 검토: Raster-to-Vector·CubiCasa5K·HEAT·RoomFormer
- [x] RTX 3060 12GB에서 CNN 마스크 1,000건 생성, 평균 75.3ms
- [x] 홀드아웃 개선: 방 F1 30.60→47.52%, 벽 F1 54.07→76.63%
- [x] 로컬 추론 서버: CUDA 우선, CUDA 없음/실패 시 CPU 자동 폴백
- [x] UI 자동 감지 + CNN 실패 시 기존 브라우저 CV 폴백
- [x] 기존 실패 사례 벽0·방0 → 벽13·방6, 3D 렌더·콘솔 오류 0

판정: 개선은 유의미하지만 방 F1 47.52%로 업무 자동 완성 기준에는 미달. 상업 배포 전 CubiCasa CC BY-NC 라이선스 검토 필요.
근거: `docs/evidence/CV-ALGORITHM-IMPROVEMENT.md`.

### M26 상업 사용 가능한 무료 라이선스 조사 ✅

- [x] 데이터셋: ResPlan·MSD·ProcTHOR·CubiCasa·Structured3D·FloorPlanCAD·RPLAN·CVC-FP·ROBIN 비교
- [x] 모델/코드: SAM 2·Raster-to-Vector·RoomFormer·DeepFloorplan·HEAT·OpenCV·PyTorch·ONNX Runtime 비교
- [x] 코드·데이터·가중치 라이선스를 분리해 상업 가능/조건부/불가로 분류
- [x] 권장 조합: ResPlan + 라이선스 확인 MSD + ProcTHOR/자체 데이터 + SAM 2/자체 segmentation + ONNX Runtime

판정: 명확하게 상업 사용 가능한 완성형 floorplan 전용 가중치는 찾지 못함. 상업 허용 데이터로 자체 가중치를 학습하는 경로가 가장 안전함.
근거: `docs/evidence/CV-LICENSE-COMPARISON.md`.

### M27 연구 단계 1 — 문·창 직접 벡터화 ✅

- [x] 현재 CubiCasa 벽 하이브리드 유지
- [x] CNN icon channel `door=2`, `window=1` mask 출력
- [x] 연결요소→최근접 벽 투영→폭 계산→중복 제거→Opening 변환
- [x] 모든 opening을 w1에 귀속하던 문제 수정, 실제 최근접 벽 ID·offset 저장
- [x] 개발 100건: 문 위치 F1 88.55%, 창 위치 F1 83.71%
- [x] 홀드아웃 900건: 문 위치 F1 18.98→87.07%, 창 위치 F1 0.67→82.97%
- [x] 전체 1,000건: 문 위치 F1 87.21%, 창 위치 F1 83.05%
- [x] 실제 GPU UI: 정답 문6·창3 → 예측 문7·창3, 3D 렌더·콘솔 오류 0

판정: 문·창 직접 벡터화는 채택. 방 F1 47.82%로 전체 기능은 계속 사용자 검수 전제.
근거: `docs/evidence/CV-RESEARCH-STAGE-1.md`.

### M28 공개 라이선스 실도면 10종 게이트 ✅

- [x] Wikimedia Commons 주거 평면도 8종 고정 후보 선언
- [x] API 라이선스 허용 목록 검증 + 출처·저작자·SHA-256 매니페스트
- [x] FOCSA·한국 33평과 합쳐 10종 직렬 브라우저 벤치마크
- [x] 단일 도면 변환 7/8 · 복수 입력 감지 2/2 · 전체 안전 처리 9/10
- [x] 어두운 배경 밝은 선 복구 + Somerville/Paris 복수 영역 적용 차단

판정: 스타일 다양성 안전 처리 게이트는 확보했지만 정답 정확도나 사용자 성공률은 아니다. 남은 실패는 Space Apartment의 두꺼운 밴드로 인한 축척·방 폐합 붕괴다.
근거: `docs/evidence/CV-REAL-FLOORPLAN-10.md`.

### M29 어두운 배경 극성 + 복수 평면 안전 차단 ✅

- [x] 외곽 명암 기반 밝은 선/어두운 배경 극성 판정
- [x] 밝은 픽셀 상위 클래스 2차 Otsu로 색상 채움 제거
- [x] 어두운 Apartment `19벽/0방/0문` → `16벽/7방/4개구부`
- [x] 벽선 투영·slab 검증으로 Somerville 4영역·Paris 2영역 감지
- [x] Harris·State House·Bungalow·Space 단일 입력 오탐 방지
- [x] 복수 입력 Apply 차단 + 단일 도면 재업로드 시 차단 해제
- [x] 단일 변환 7/8 · 복수 감지 2/2 · 전체 안전 처리 9/10

판정: 요청한 두 개선은 완료. 남은 CV 우선순위는 Space Apartment의 굵은 해칭에 의한 벽 두께 p90·축척 오염 제거다.
근거: `docs/tdd/2026-08-28-dark-polarity-and-multi-input.md`.

### M19 AI 재시도·실측 + 잔여 검증 ✅

- [x] AI 429 자동 재시도 (6s/18s 백오프, 상태 표시) — 공유 풀 모델 혼잡 대응
- [x] OpenRouter 호환 설정 + .env.local 키 주입(git 제외) + 스모크 통과
- [x] 전체 해석 플로우: 업스트림 429 시 skip — 회복 후 재실행 가능
- [x] 실도면 추가 수집: Wikimedia 429 지속 — fixtures 재실행 대기 (스크립트 유지)
- [x] preview 스모크 간헐 실패 수정 (스토어 마운트 대기 추가, 3회 연속 통과)

검증: 단위 93 / E2E app 38 + walk 4 + cv 1 + benchmark 1 / tsc / build (2026-08-25)

### M16 캐릭터 워크스루 + 세션별 프로젝트 저장소 ✅

- [x] TDD: walk.ts 충돌 해석 (원-AABB 7테스트, 축별 슬라이드, 벽+가구+경계)
- [x] 캐릭터 설정: 신장(cm)·몸무게(kg) → 눈높이(신장×0.94)·캐릭터 반경 자동 산정 (WalkPanel)
- [x] 1인칭: 눈높이 시점 / 3인칭: 캐릭터 후방 추적 카메라 + 캡슐 캐릭터 렌더 (readPixels 픽셀 검증)
- [x] 가구 충돌: 배치 가구 유효 치수 AABB + 캐릭터 반경 (벽만 막던 기존 한계 개선)
- [x] 워크스루 설정 패널 (신장/몸무게 슬라이더, 시점 전환)
- [x] E2E: 진입/설정/WASD 이동/가구 충돌 차단 단정 + 3인칭 readPixels 검증 (4종)
- [x] 회귀 + 문서

### M17 세션별 다중 프로젝트 저장소 ✅

- [x] StorageAdapter 인터페이스 + SessionStorageProjectRepository (사이클/탭 격리/덮어쓰기/손상 복구)
- [x] store 통합: projectId·newProject/openProject/deleteProject, 기존 단일 슬롯 자동 마이그레이션
- [x] 📁 프로젝트 모달 (목록/생성/열기/삭제, 현재 프로젝트 표시)
- [x] 동일 브라우저 탭별 저장소 격리 + 같은 탭 새로고침 복구 E2E
- [x] DB 전환 준비: 어댑터 교체만으로 계정별 CRUD 확장 (Vercel KV/Postgres 계획)

### AI 기본 모델 변경 ✅

- [x] 기본: OpenRouter `google/gemma-4-26b-a4b-it:free` (vision) — 키는 .env.local(git 제외) 또는 ⚙️ 설정 입력
- [x] 401/402/429 상태별 메시지 + 빈 키 가드 + **모든 에러 Toast 일원화**(alert 제거)

검증: 단위 83 / E2E 38(+AI skip 2) / preview 스모크 / tsc / build (2026-08-25)

## 🔖 체크포인트 로그

- 2026-08-24: 계획 수립, 딥인터뷰 확정, M0~M1 완료
- 2026-08-25: **M2~M7 전체 완료.** tsc/build/dev서버 검증 통과 (localhost:5173).
  다음 세션은 Backlog 항목 또는 사용자 피드백 반영부터 시작.
- 2026-08-25 (후속): **M8 완료** — 워크스루·배치안 비교·GLTF 지원. 전체 마일스톤 종료.
  남은 것은 Backlog(커튼/조명 시뮬/견적서)와 사용자 피드백 반영뿐.
- 2026-08-25 (TDD/E2E): **M9 완료** — 단위 29 + E2E 5 통과. E2E가 배치 선택 소멸 버그 등
  실버그 2건 발견·수정. `npm test` / `npm run test:e2e`로 회귀 검증 가능.
- 2026-08-25 (고도화): **M10 완료** — 단위 36 + E2E 15 + 실브라우저 15단계.
  브라우저 직접 실행으로 **카메라 far 클리핑(3D 전체 미렌더) 치명버그** 발견·수정.
  교훈: 상태 어설션 테스트만으로는 시각 버그 못 잡음 — 스크린샷 검증 병행 필수.
- 2026-08-25 (M11): 브랜드 실측 DB 도입 — 한샘·LG 11종, 출처 URL 추적, 브랜드 필터.
  E2E에서 2D 개구부 배치 막힘 버그 추가 발견·수정.
- 2026-08-25 (M12): **브랜드 DB 대확장** — 삼성전자·IKEA·시몬스 추가, 총 5브랜드 24종.
  브랜드 칩 동적 생성(TDD), 브랜드 믹스 배치안 시각 검증 완료.
  추가 절차: brands/*.json에 제품 추가 → 자동 검증 → 카탈로그 반영 (코드 수정 불필요)
- 2026-08-25 (M13): UX 고도화 완료 — 선택 아웃라인·카드 하이라이트·드래그 중 카메라 고정·
  이동완료 버튼(+공간부족 Toast·원위치)·가격 탭·LAN 접속(http://10.10.12.108:5173)·
  OpenRouter AI 연동(TDD). 클릭선택 드래그 막힘·벽 바깥 노멀 버그 2건 수정.

## ▶️ 다음 세션 시작 가이드

1. 이 파일 읽기 → `interior3d/` 폴더가 현재 구현체
2. 실행: `cd interior3d && npm run dev` → http://localhost:5173
3. 검증 상태: tsc --noEmit 통과, npm run build 성공
