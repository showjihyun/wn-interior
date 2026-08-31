# 선택적 참조 라우팅

이 파일은 `interior3d` 작업에서 어떤 문서를 읽어야 하는지 결정하는 짧은 인덱스다. 모든 문서를 매번 로드하지 않는다. 아래에서 현재 작업과 직접 일치하는 행의 `필수`만 읽고, `조건부`는 해당 세부 주제가 실제 범위일 때만 읽는다.

경로는 이 파일이 있는 `interior3d/` 기준이다.

| 작업 유형                                        | 필수                                                                  | 조건부                                                                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 핵심·기본 기능, 제품 준비도, 마일스톤 완료 리뷰  | `docs/CORE-FEATURE-COMPLETENESS.md`                                   | 사용자 검증이면 `docs/USER-VALIDATION.md`; README 주장 감사면 `docs/README-REVIEW.md`                                                                                                                                       |
| 동작 추가·변경, 버그 수정                        | `docs/TDD-WORKFLOW.md`                                                | 해당 기능의 최신 `docs/tdd/` 기록 1개만 `rg`로 선택                                                                                                                                                                         |
| 클린 아키텍처·레이어 경계                        | `docs/CLEAN-ARCHITECTURE-MIGRATION.md`                                | 핵심 완성도까지 평가할 때만 `docs/CORE-FEATURE-COMPLETENESS.md`                                                                                                                                                             |
| 제품 아키텍처·사용자/데이터/배포 워크플로우 설명 | `docs/products/architecture.html`, `docs/products/workflow.html`      | 제품 주장 감사면 `docs/README-REVIEW.md`; 구현 근거를 바꾸면 해당 소스·테스트                                                                                                                                               |
| 도면 CV·AI 정확도·모델 교체                      | 관련 소스와 테스트                                                    | 전략은 `docs/evidence/CV-MODEL-STRATEGY.md`; 정확도 주장은 `docs/evidence/CV-ACCURACY-AUDIT.md`; 실제 10종 회귀는 `docs/evidence/CV-REAL-FLOORPLAN-10.md`; Raster2Seq 교체는 `docs/evidence/RASTER2SEQ-REPLACEMENT-GATE.md` |
| 3D 이미지→2D 도면·Codex imagegen 비교            | `docs/evidence/CODEX-IMAGEGEN-3D-TO-2D-FEASIBILITY.md`                | 실제 실행 시 정답 Project·입력 view·고정 prompt·반복 횟수와 생성 결과를 함께 보존                                                                                                                                           |
| 생성 메시·TripoSR·검역·게시                      | `docs/HYBRID-GENERATED-MESH-PLAN.md`, `docs/GENERATED-MESH-WORKER.md` | 권리·배포는 `THIRD_PARTY_ASSETS.md`; KIVIK 다중 시점은 `docs/evidence/KIVIK-MULTIVIEW-FEASIBILITY.md`                                                                                                                       |
| IKEA 가격·상품 데이터·사진 재질·파라메트릭 형상  | `docs/IKEA-RETAIL-CATALOG-TEXTURE-PLAN.md`                            | 권리 판단은 `THIRD_PARTY_ASSETS.md`; 특정 회귀 이력은 관련 `docs/tdd/` 1개                                                                                                                                                  |
| 저장·Undo/Redo·프로젝트 문서                     | 관련 application/domain 소스와 테스트                                 | 데이터 손실 또는 전체 준비도 리뷰일 때만 `docs/CORE-FEATURE-COMPLETENESS.md`                                                                                                                                                |
| 사용자 과업·사용성 검증                          | `docs/USER-VALIDATION.md`                                             | 세션 기록 작성 시 `docs/USER-VALIDATION-SESSION-TEMPLATE.md`                                                                                                                                                                |
| 문서·서식만 변경                                 | 이 파일 외 추가 필수 문서 없음                                        | 내용이 제품 주장이나 라이선스를 바꾸면 해당 행을 적용                                                                                                                                                                       |

## 로딩 규칙

1. 선택한 필수 문서는 끝까지 읽는다.
2. 같은 주제의 과거 TDD 기록 전체를 읽지 않는다. `rg -n "<기능명>" docs/tdd docs/evidence`로 후보를 좁힌다.
3. JSON 벤치마크 원문은 수치 재계산이 필요한 경우에만 읽는다. 요약 Markdown을 먼저 사용한다.
4. 문서보다 현재 코드·테스트·실행 결과를 우선하며, 충돌 시 최종 답변에 이유를 기록한다.
5. 현재 작업에 해당하는 행이 없으면 소스와 테스트부터 조사하고, 필요한 문서가 확인될 때만 추가로 읽는다.
