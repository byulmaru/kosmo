## Decision Records

### Browser config는 product bootstrap 전에 fail-closed로 읽는다

- Decision Date: 2026-08-25
- Authority / Provenance: `PROD-833`
- Status: Active
- Outcome: Web entrypoint는 allowlist된 runtime JSON을 검증한 뒤 telemetry와 React를 시작하며 실패 시 retry 화면만 표시한다.

### Runtime config는 no-store JSON으로 제공한다

- Decision Date: 2026-08-25
- Authority / Provenance: `PROD-833`
- Status: Active
- Outcome: BFF는 static asset을 수정하지 않고 세 공개 필드만 same-origin JSON으로 반환한다.

### Environment와 telemetry는 runtime이고 release는 build identity다

- Decision Date: 2026-08-25
- Authority / Provenance: `PROD-833`, `PROD-493`, `PROD-469`
- Status: Active
- Outcome: DSN, environment와 OpenPanel client ID는 runtime에서 받고 Sentry release와 source map은 `kosmo@<full SHA>`를 사용한다.

### Docker Build run과 작은 digest map이 canonical artifact를 식별한다

- Decision Date: 2026-08-26
- Authority / Provenance: `PROD-833`, `PROD-831`, 사용자 단순화 요청
- Status: Active
- Outcome: GitHub Docker Build run이 source SHA와 trusted build identity를 소유하고, artifact는 runtime 이름에서 `build-push-action` digest로의 map만 보관한다. 같은 run에서 내려받은 값을 중복 metadata나 승인 후 재검증으로 다시 증명하지 않는다.

### Production 승인은 재build가 아니라 mutation을 gate한다

- Decision Date: 2026-08-25
- Authority / Provenance: `PROD-833`, `PROD-783`
- Status: Active
- Outcome: `prod` 승인은 고정된 SHA와 digest의 runtime config, migration과 workload 변경을 gate하며 image를 다시 build하지 않는다.

### 첫 PR은 main의 single-image topology에서 독립 전달한다

- Decision Date: 2026-08-25
- Authority / Provenance: `PROD-833` sequencing comment
- Status: Active
- Outcome: 현재 artifact는 `runtime` entry 하나를 사용하고 PROD-831 stage 2가 main에 반영될 때 같은 map을 확장한다.

### Native config와 OTA는 범위 밖이다

- Decision Date: 2026-08-25
- Authority / Provenance: `PROD-833`
- Status: Active
- Outcome: Android/iOS API·OIDC 설정은 기존 build-time 계약을 유지한다.

## Superseded Decisions

- `deploy-production-from-main-or-sha`의 환경별 image build 결정은 canonical digest 승격으로 대체된다.
- 이 change의 이전 상세 release manifest 결정은 Docker Build run과 작은 digest map 결정으로 대체된다.
