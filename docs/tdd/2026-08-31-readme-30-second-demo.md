# README 30초 실제 사용 데모

- 계약: 실제 Chromium 사용 흐름을 담은 GIF는 960×540, 150프레임, 프레임당 200ms로 정확히 30초이며 도면 업로드·축척·검수·3D·상품 배치·가격·워크스루를 포함한다.
- 검증 대상: `scripts/capture-readme-demo.ts`, `docs/assets/homeplan-3d-demo.gif`

## RED

- 명령: Sharp metadata로 기존 `docs/assets/homeplan-3d-demo.gif`의 width, pageHeight, pages와 delay 합계를 검사
- 종료 코드: `1`
- 실패 이유: 기존 결과는 `960×540`, `100 frames`, `20,000ms`로 30초 계약의 `150 frames`, `30,000ms`를 만족하지 않았다.

## GREEN

- 명령: `npm run demo:gif`
- 결과: 종료 코드 0, `1.09 MiB` GIF 생성
- 동일 metadata 검사: `960×540`, `150 frames`, `30,000ms`, 무한 반복 확인

## REFACTOR

- 실제 제품의 근거 기반 검수 게이트에 맞게 오래된 `바로 3D 보기` 우회 흐름을 제거했다.
- 2D 대표 요소 선택·판정·근거 저장 뒤 3D로 이동하도록 실제 사용자 경로를 캡처한다.
- 고정 화면 좌표가 가져온 도면에서 실패하므로 면적이 큰 실제 room 후보를 순회해 카메라 좌표로 투영한다.
- 영문 단계 캡션, 카탈로그 KIVIK 배치, 실시간 가격, 워크스루·점프와 마지막 아이소 전체 공간 복귀를 추가했다.
- 대표 프레임 6장을 시각 검토해 원본/벡터 비교, 검수, 3D, 가격과 최종 장면이 실제로 기록됐음을 확인했다.
- 미확인/skip: 사용자 관찰은 수행하지 않았다. GIF는 한 개의 고정 한국 33평 fixture를 보여주며 일반 정확도 증거가 아니다.
