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

| 항목 | 결정 |
|---|---|
| 도면 입력 | AI 해석 + 트레이싱 + 직접 그리기 3종 전부 |
| AI | OpenAI 호환 API 어댑터 (baseUrl/key/model 설정화면 입력, 키 없으면 폴백) |
| 가구 렌더링 | 파라메트릭 박스 조합 (실측 재현, GLTF 확장 필드만 유지) |
| 대상 공간 | 국민아파트 평면(34평형대) 샘플 내장 |
| 실행 | 로컬 dev 중심 (`npm run dev`) |
| UI 언어 | 한국어 |

## 🏗️ 아키텍처 요약

- Vite + React18 + TS + @react-three/fiber + drei + zustand
- 단일 데이터 소스: `Project{plan, placements}` → 2D(SVG)/3D(three.js) 모두 이것만 렌더
- 단위: 전부 mm 내부 저장, 화면에 cm/m 병기
- Undo/Redo: zustand 스냅샷 스택, localStorage 자동저장(debounce)

---

## 📋 MILESTONES

### M0 셋업 ✅
- [x] Vite+React+TS+R3F 프로젝트 골격, npm install

### M1 코어 데이터
- [x] 타입 스키마 (types.ts: Wall/Opening/Room/Product/Placement)
- [x] 국민아파트 샘플 평면도 (samplePlan.ts)
- [x] 실측 카탈로그 28종 (catalog.ts) + 마감재 정의 (materials.ts)

### M2 스토어 & 엔진 ✅
- [x] zustand 스토어: 배치/선택/Undo-Redo/localStorage 자동저장
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

### M11 실제 브랜드 제품 DB (한샘·LG전자) ← **현재 진행**
- [ ] 계획: 웹 리서치 → JSON DB → 카탈로그 통합 → 배치 검증
- [ ] 리서치: 한샘(주방·수납·침실 대표 제품), LG전자(TV·코드제로·디오스·퓨리케어) 실측 규격 + 출처 URL 수집
- [ ] 스키마 확장: Product에 brand/model/sourceUrl/sourcedAt 필드 (출처 추적 가능한 DB)
- [ ] 데이터 파일화: src/data/brands/{hanssem,lg}.json — 코드 수정 없이 DB 교체 가능
- [ ] 신규 셰이프: 로봇청소기(원형), 공기청정기(타워), OLED TV(슬림+스탠드)
- [ ] 카탈로그 UI: 브랜드 필터 + 제품 카드에 브랜드/모델명 표기
- [ ] TDD: 카탈로그 병합/검증 로직(mergeBrands) 실패테스트 → 구현
- [ ] E2E: 브랜드 필터 → 한샘 싱크대 벽부착 배치 / LG 로봇청소기 배치 → 실측 확인
- [ ] 실브라우저 스크린샷 검증

> ⚠️ 데이터 유의: 규격은 공식 몰·쇼핑몰 공개 스펙 기준. 옵션(모듈/설치형)에 따라 달라
> 수 있으므로 sourceUrl로 출처를 남기고, 시공품은 구매 전 실측 권장 문구 표기

### M12 브랜드 DB 대확장 (9개 브랜드) ← **현재 진행**

**브랜드·카테고리 매트릭스 (각 2~3곳):**
| 카테고리 | 브랜드 |
|---|---|
| 가전 | LG전자 ✓(M11), 삼성전자(냉장고·The Frame TV·세탁기) |
| 전체가구 | 한샘 ✓(M11), IKEA(소파·침대·옷장·책장·테이블) |
| 침대 | 시몬스, 에이스침대, IKEA MALM |
| 식탁 | 일루미, 한샘, IKEA |
| 조명 | 담소사이, IKEA(FADO 등) |

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

### M14 오늘의집 벤치마크 반영 ← **현재 진행**
- [x] 벤치마크 문서: docs/BENCHMARK-ohouse.md
- [ ] ① 단축키 `1`(2D)/`3`(3D)
- [ ] ② 카탈로그 카드: 색상 스와철 + "배치 N개" 뱃지
- [ ] ③ 인스펙터 치수 오버라이드 (유사 제품 + 실측 조정 워크플로우, TDD: resolveDims)
- [ ] ④ 조명 강도 슬라이더
- [ ] ⑤ 회귀 + 문서
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

### M18 백로그 소화 (커튼·견적서) + CV 실도면 벤치마크 ← **현재 진행**
- [x] 커튼·롤스크린 제품 추가 (창가 배치, 주름/롤 셰이프 신규)
- [x] 견적서 내보내기: buildQuoteText TDD (방 면적·마감재·제품 합계 .md 다운로드, 가격 탭 버튼)
- [x] 리서치: Ahmed 등 두께 분리 기법·Manhattan 가정(Raster-to-Vector)·Deep Floorplan 후처리(경계 플러드필) 확인 → 고전 4기법 선정
- [x] CV 개선(TDD 6종): 소형 연결요소 제거, Otsu, 모폴로지 클로징, 직교 스냅 + 반전 자동감지(invertGray)
- [x] 웹 실도면 다운로드: Wikimedia FOCSA 아파트 평면도 (551×711) — 추가 이미지는 429 제한으로 재수집 필요
- [x] cv-benchmark: FOCSA 실측 — 벽 44·방 3·문 22·축척 16.7mm/px·52ms (Otsu 138 + 자동 반전 적용)
- [x] 회귀 + 문서
- [x] **버그 수정**: newProject가 모드를 전환하지 않아 빈 도면이 3D로 열리던 문제 → 2D로 시작

검증: 단위 93 / E2E 38+벤치마크 통과 / tsc OK / build OK (2026-08-25)

### M19 AI 재시도·실측 + 잔여 검증 ✅
- [x] AI 429 자동 재시도 (6s/18s 백오프, 상태 표시) — Ox Alpha 업스트림 혼잡 대응
- [x] AI 기본 모델 Ox Alpha 확정 + .env.local 키 주입(git 제외) + 스모크 통과
- [x] 전체 해석 플로우: Ox Alpha 업스트림 429 혼잡 지속으로 skip — 회복 시 자동 성공
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
- [x] StorageAdapter 인터페이스 + LocalStorageAdapter (TDD 6종: 사이클/격리/덮어쓰기/손상 복구)
- [x] store 통합: projectId·newProject/openProject/deleteProject, 기존 단일 슬롯 자동 마이그레이션
- [x] 📁 프로젝트 모달 (목록/생성/열기/삭제, 현재 프로젝트 표시)
- [x] DB 전환 준비: 어댑터 교체만으로 계정별 CRUD 확장 (Vercel KV/Postgres 계획)

### AI 기본 모델 변경 ✅
- [x] 기본: OpenRouter stealth/ox-alpha (vision) — 키는 .env.local(git 제외) 또는 ⚙️ 설정 입력
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
