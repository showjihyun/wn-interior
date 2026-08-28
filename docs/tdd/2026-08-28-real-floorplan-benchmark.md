# 공개 라이선스 실도면 10종 회귀 게이트

- 계약: 실도면 10종은 출처·라이선스·SHA-256이 고정되고, 벽과 방을 모두 생성하는 구조 변환 성공률이 80% 아래로 내려가면 회귀 테스트가 실패해야 한다.
- 테스트: `e2e/cv-benchmark.spec.ts`

## RED / 최초 특성화

- 첫 다운로드 명령: `python scripts/fetch-wikimedia-floorplans.py`
- 종료 코드: `1`
- 실패 이유: 로컬 Python CA 인증서 만료. TLS 검증을 끄지 않고 `certifi` 번들을 사용하도록 수정했다.
- 최초 후보 실행: 성공 7, 실패 3. 개인정보성 숫자가 포함된 파일명 후보를 Public Domain 뉴질랜드 주택 도면으로 교체했고, 교체 후보는 정상 변환됐다.

이 작업은 신규 데이터셋의 최초 특성화이므로 실패 2종을 구현 회귀처럼 GREEN으로 포장하지 않는다.

## GREEN

- 명령: `npx playwright test e2e/cv-benchmark.spec.ts`
- 결과: `12 passed`
  - Wikimedia 라이선스·출처·SHA-256 무결성 1건
  - 실도면 변환 10건
  - 성공률 집계·리포트 1건
- 게이트: `8/10 = 80%`, 회귀 하한 `80%`

## REFACTOR

- 수집 스크립트가 허용 라이선스가 아닌 파일을 거부하도록 했다.
- 개별 성공 사례에는 최초 측정치보다 낮은 회귀 하한을 설정했다.
- 실패 사례 2종은 `expectedConversion: false`로 명시하되 전체 성공률 분모에서는 제외하지 않았다.
- 전체 검증: 확대 직후 `npm run verify:full` 종료 코드 `0`(단위 `140`, E2E `55 passed / 2 skipped`, preview `3`). 개인정보성 파일명 후보 교체 후 `npm run verify`와 10종 벤치마크 `12 passed`를 다시 확인했다.
