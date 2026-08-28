# CV benchmark fixtures

- `real-focsa-apt.jpg`: Wikimedia Commons의 “Typical apartment floor plan FOCSA Building”. 원본 페이지의 라이선스와 출처를 따른다.
- `real-korean-33pyeong.png`: 작업공간에 제공된 `33평 아파트 평면도.png`의 테스트용 사본. 도면 표기 전체 폭 11,800mm를 축척 오차 측정에 사용한다.
- `cv-benchmark-baseline.json`: 각 실도면이 만족해야 하는 최소 검출 기준이다. 완화할 때는 회귀 원인을 기록한다.
- `real-wikimedia-*`: Wikimedia Commons에서 고정한 공개 라이선스 주거 평면도 8종이다. `wikimedia-floorplans.json`에 원본 파일 페이지, 저작자, 라이선스, 원본/벤치마크 크기와 SHA-256을 기록한다.
- `wikimedia-floorplans.json`: `python scripts/fetch-wikimedia-floorplans.py`가 API에서 라이선스를 재검증한 뒤 생성하는 고정 매니페스트다.

전체 실도면 게이트는 FOCSA·한국 33평·Wikimedia 8종, 총 10종이다. 단일 도면 변환률, 복수 입력 감지율, 변환 또는 안전 차단을 합친 전체 안전 처리율을 분리해 집계한다. 어느 값도 정답 정확도나 사용자 성공률을 뜻하지 않는다.

실행 결과는 추적하지 않는 `test-results/cv-benchmark-latest.json`에 저장된다.
