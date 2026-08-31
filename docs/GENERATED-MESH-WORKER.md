# 오프라인 생성 메시 worker·검역·게시

브라우저는 생성 모델이나 승인 기록을 알지 못한다. worker는 localhost에서만 호출되며 모든 결과는 먼저 `artifacts/generated-mesh/quarantine/`에 저장된다.

## 1. 모델과 실행 경계

초기 권장 모델은 공식 코드와 pretrained model이 MIT인 TripoSR이다. 공식 기본 실행은 단일 이미지에 약 6GB VRAM을 사용하므로 현재 RTX 3060 12GB에서 시험할 수 있다. 실제 품질·입력 권리 검토 전에는 어떤 결과도 공개 manifest에 추가하지 않는다.

`services/triposr-worker` 자체를 Vercel Python Function으로 배포하지 않는다. 이 worker는 CUDA PyTorch 기반 이미지, Git 빌드형 `torchmcubes`, 네이티브 `xatlas/moderngl`, 지속 모델 캐시가 필요한 GPU Docker 서비스다. `vercel services/triposr-worker`는 Vercel Python builder가 이 구성을 serverless 함수로 오판하므로 지원 경로가 아니다. 루트 `.vercelignore`는 `services/**`를 제외하고 `npm run test:vercel-boundary`가 이 경계를 검사한다. worker는 아래 Docker 명령으로 GPU 호스트에 독립 배포한다.

설치·실행:

```powershell
npm run mesh:service:build
npm run mesh:service:start
npm run mesh:service:health
```

고정 구성:

- upstream commit: `107cefdc244c39106fa830359024f6a2f1c78871`
- 모델: `stabilityai/TripoSR`
- CUDA arch: RTX 3060용 `sm_86`
- chunk size: `4096`
- marching cubes resolution: `192`
- 포트: `127.0.0.1:8980`만 공개
- 모델 캐시: `.runtime/triposr/` — Git/MIT 배포 제외

중지:

```powershell
npm run mesh:service:stop
```

worker는 다음 HTTP 계약을 구현한다.

```text
POST http://127.0.0.1:<port>/generate
Content-Type: multipart/form-data

metadata: jobId, productId, productFingerprint, targetDims,
          sourceImageSha256
image:    검증된 로컬 이미지 bytes
```

응답:

```json
{
  "glbBase64": "...",
  "contentSha256": "64자리 sha256",
  "sourceImageSha256": "입력과 동일한 sha256",
  "generatedAt": "2026-08-28T00:00:00.000Z",
  "generator": {
    "name": "TripoSR",
    "version": "고정 버전",
    "modelDigest": "64자리 모델 digest"
  },
  "silhouetteIou": 0.81
}
```

worker가 보낸 hash·bounds는 승인 근거가 아니다. 파일 저장 시 SHA-256을 다시 계산하고 GLB POSITION/index binary를 독립 검사한다. `silhouetteIou`도 사람의 3시점 이상 회전 검수를 대체하지 않는다.

## 2. 권리 fingerprint 준비

```powershell
npm run mesh:fingerprint -- --product ik-kivik-3seat
```

권리 증거 예시:

```json
{
  "attestationId": "rights-ticket-001",
  "productFingerprint": "위 명령 결과",
  "commercialUseAllowed": true,
  "derivativeUseAllowed": true,
  "allowedTerritories": ["KR"],
  "evidenceRef": "내부 계약/허가 증거 ID",
  "issuedAt": "2026-08-28T00:00:00.000Z"
}
```

`commercialUseAllowed=false`여도 로컬 검역 생성은 가능하다. 다만 publish는 반드시 거절된다. boolean만 임의로 바꾸는 것은 공개 승인 증거가 아니며, 실제 계약·허가 ID와 동일 fingerprint가 필요하다.

## 3. 생성과 quarantine

```powershell
npm run mesh:stage -- --product ik-kivik-3seat --worker-url http://127.0.0.1:8980 --rights .\rights.json
```

정상 결과는 다음만 만든다.

```text
artifacts/generated-mesh/quarantine/<product>/<job>/mesh.glb
artifacts/generated-mesh/quarantine/<product>/<job>/record.json
```

이 단계에서는 `review-pending`이며 `public/`이나 runtime manifest를 수정하지 않는다.

## 4. 사람 검수와 게시

검수 기록은 quarantine content SHA와 결합해야 한다.

```json
{
  "reviewId": "review-001",
  "contentSha256": "quarantine GLB sha256",
  "decision": "approved",
  "reviewerRef": "인증된 내부 검수자 ID",
  "reviewedAt": "2026-08-28T01:00:00.000Z",
  "reviewedViewHashes": ["64자리 hash 1", "64자리 hash 2", "64자리 hash 3"],
  "visualOnlyAcknowledged": true
}
```

```powershell
npm run mesh:publish -- --product ik-kivik-3seat --record .\artifacts\generated-mesh\quarantine\...\record.json --rights .\rights.json --review .\review.json
npm run test:mesh-assets
```

게시기는 quarantine bytes를 다시 검사하고 content-addressed GLB를 먼저 배치한 뒤 `published-manifest.v2.json`을 원자 교체한다. 브라우저 manifest에는 reviewer, 권리 증거, quarantine 경로, 모델 digest가 포함되지 않는다.

## 5. 런타임과 테스트

- published GLB 로딩 중: 기존 실측 형상+이미지 유지
- GLB 성공: `검수된 3D 표시 중`
- 404/손상 GLB: `3D 모델 오류 · 공식 사진 표시 중`
- GLB와 이미지 모두 실패: `3D·이미지 오류 · 기본 형상 표시 중`

`vite build --mode test`에서만 합성 상품과 결정론적 GLB가 주입된다. 실제 상품 JSON, 실제 published manifest, `public/`에는 테스트 승인이 들어가지 않는다.

## 6. 2026-08-28 로컬 실상품 스모크

KIVIK 공식 이미지 로컬 스냅샷으로 실제 worker를 실행한 결과:

- 생성 시간: 약 12초
- GLB: 1,172,784 bytes
- triangles: 58,532
- output SHA-256: `58ae8a0a80a88585cfca0f15f3c48738d175253a9c102407f96a67d2b9c01a3c`
- 모델 SHA-256: `429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee`
- silhouette IoU: `0.229`
- 결과: quarantine 성공, 공개 거절

공개 거절 사유는 `rights-not-approved`, `silhouette-score-too-low`, `geometry-not-approved`다. 결과 GLB는 `artifacts/generated-mesh/quarantine/`에만 있으며 Git과 MIT 배포에서 제외된다.

## 7. 좌표·평가 보정 후 3차 후보

TripoSR의 `Z-up, Y=폭, X=깊이` 좌표를 Three.js `Y-up`으로 변환하고, 배경·위치·스케일을 정규화한 silhouette 비교를 적용했다.

- GLB SHA-256: `d608c0fa3ff08abf6ddd75ec2eb9e41904f7f4777496662b8c9c6926f76677b3`
- canonical bounds: `W 1.091 / D 0.870 / H 0.500`
- normalized silhouette IoU: `0.923`
- 공식 W/D/H 축 보정비: `1.915×`
- 공식 W/H·D/H 최대 비율 오차: `52.1%` — 허용 한계 `5%` 초과
- review views: 전처리 1장 + 회전 4장
- 자동 판정: `자동 게이트 실패` — `dimension-ratio-error-too-large`
- 공개 상태: 미게시 — commercial permission false, 사람 승인 미완료

검수 보고서 생성:

```powershell
npm run mesh:review -- --record <quarantine/record.json>
```

`review.html`과 기본 결정이 `rejected`인 `review-template.json`이 같은 quarantine 디렉터리에 생성된다. publish는 실제 저장된 review PNG hash만 검수 증거로 인정한다.

## 8. 앱 안에서 로컬 검수

사람이 게시 결정을 내리기 전에도 격리된 메시를 실제 방 배치·회전 흐름에서 확인할 수 있다. 이 경로는 명시적으로 선택한 단일 `review-pending` record만 개발 서버 메모리로 주입하며, `public/`이나 published manifest를 수정하지 않는다.

`.env.local` 예시:

```dotenv
VITE_ENABLE_LOCAL_MESH_REVIEW=true
VITE_LOCAL_MESH_REVIEW_RECORD=artifacts/generated-mesh/quarantine/<product>/<job>/record.json
```

```powershell
npm run dev
npx playwright test e2e/local-mesh-review.spec.ts --retries=0
```

개발 서버는 시작할 때 record 상태, product fingerprint, GLB·검수 이미지의 SHA-256과 byte length를 다시 검증한다. 자동 게이트 통과 후보는 `로컬 생성 3D · 검수 대기/중`, 실패 후보는 `로컬 생성 3D · 자동 게이트 실패`로 표시한다. 실패 후보도 원인 분석을 위해 로컬 렌더링할 수 있지만 게시 후보로 취급하지 않는다. 배치 가능 여부, 충돌, inspector 치수는 계속 공식 상품의 mm 치수를 사용한다.

검수 파일은 content-addressed `__local-mesh-review__` 경로에서 `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`로만 제공된다. allowlist 밖 파일과 quarantine 밖 경로는 404 또는 시작 오류로 차단한다. 플러그인은 `vite serve`에만 적용되고 production/test build에는 local payload, record 경로, GLB가 포함되지 않는다. `npm run test:bundle-budget`가 이 비노출 계약도 검사한다.

## 9. KIVIK 다중 시점 타당성 A/B

```powershell
npm run mesh:experiment:kivik -- --fetch
```

공식 상품 페이지의 이미지와 DIMMA GLB를 hash 고정된 로컬 참고자료로 내려받아 현재 TripoSR 결과와 같은 공식 치수 비율 게이트로 비교한다. 모든 바이너리는 `.runtime/`과 quarantine에만 두며 게시하지 않는다.

| 후보                     | 최대 W/H·D/H 오차 | triangles |     bytes | 5% 게이트 |
| ------------------------ | ----------------: | --------: | --------: | --------- |
| TripoSR 단일 이미지      |             52.1% |    58,532 | 1,172,784 | 실패      |
| IKEA DIMMA 공식 참고 GLB |              3.1% |    21,297 |   770,028 | 통과      |

공식 이미지 6개 중 전체 제품의 독립 기하 시점은 정면 사선 1개뿐이다. 처음 후면 시점으로 분류한 PE760802는 회전 검수에서 한쪽 좌석 구간만 보이는 부분 확대 이미지로 확인되어 제외했다. MIT인 TRELLIS multi-image는 공식 요구 VRAM이 16GB 이상이지만 현재 RTX 3060은 12GB다. 따라서 현 환경에서는 다중 시점 모델 설치·생성을 중단하고 공식 3D 참고자산을 로컬 품질 상한선으로 사용한다. 배포 가능성을 의미하지 않으며 제품 런타임은 계속 공식 사진 기반 형상을 사용한다.

후속 카탈로그 사전점검에서는 IKEA 12개 항목 중 KIVIK 1개에서만 DIMMA GLB가 발견됐다. 제공률 8.3%와 미확인 재사용 권리 때문에 범용 공식-3D 자동 연결 어댑터는 구현하지 않는다.

## 10. 고해상도 시점별 재생성·후보 선택

```powershell
npm run mesh:experiment:kivik -- --fetch
npm run mesh:experiment:kivik:regenerate -- --worker-url http://127.0.0.1:8980
```

재생성 명령은 해시가 고정된 입력 중 동일 변형·전체 제품 노출·독립 기하 증거를 모두 만족하는 시점만 worker에 순차 전달한다. 각 GLB는 응답 SHA-256을 다시 계산하고 실제 POSITION/index bounds와 triangle 수를 검사한다.

- 치수비 최대 오차 5% 이하
- silhouette IoU 0.75 이상
- 전체 제품 시점 증거 통과

세 조건을 같은 후보가 모두 만족해야 `gate-passed`가 된다. 실패하면 최선 시도 `mesh.glb`, 회전 뷰, `record.json`, `experiment-report.json`만 quarantine에 남고 게시 manifest는 수정하지 않는다.

2026-08-31 KIVIK 결과는 고해상도 정면 후보 51.69%로 기존 52.09%보다 0.40%p 개선됐지만 여전히 거절됐다. PE760802 후면 이미지는 부분 확대이므로 후보에서 제외했다.
