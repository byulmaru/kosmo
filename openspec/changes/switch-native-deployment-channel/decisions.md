## Context

이 기록은 `PROD-956` Native channel selector와 `PROD-334` Cloudflare delivery Rule의 현재 canonical 문서 및
Linear 계약을 반영한다. 기존 전체 OTA release/device/runbook change와 `PROD-336` 소유 범위는 이 change에
흡수하지 않는다.

## Decision Records

### Native channel selector는 dev와 prod만 제공한다

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/design/breakpoints.md`, `PROD-956`
- Status: Active
- Context / Problem: Native에서 개발·운영 환경을 바꿀 수 있어야 하지만 Web channel UI와 publisher의 일반 channel 계약을 함께 넓히면 제품 범위가 바뀐다.
- Decision Outcome: Native `정보`와 사전 로그인 복구 진입점은 `dev`·`prod`만 보여 주고, Web Settings와 Web channel UI는 그대로 둔다.
- Alternatives Considered: publisher channel 전체를 Native selector에 노출하거나 Web selector를 추가하는 방법. 승인된 제품 범위를 넓히므로 선택하지 않는다.
- Consequences: Native UI와 접근성 검증은 두 값에 한정하며, generic publisher channel 허용 규칙은 delivery 경계에 남는다.
- Confirmation / Follow-up: `PROD-956`의 authenticated/pre-login UI 및 no-op 시나리오와 Native runtime evidence로 확인한다.

### 고정 R2 URL을 Cloudflare URL Rewrite Rule로 기존 tuple에 연결한다

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/expo-ota.md`, `PROD-334`, `PROD-956`
- Status: Active
- Context / Problem: Native request는 project를 URL에 유지하면서 platform, channel, runtimeVersion을 header로 전달해야 하고, static R2와 기존 edge rule을 보존해야 한다.
- Decision Outcome: 공용 host의 `/releases/{project}` 단일 project path에 대한 exact GET 요청을 required header와 함께 검사하고, project path segment를 보존한 URI path만 기존 tuple manifest path로 내부 rewrite한다. Native 앱은 자신의 project인 `kosmo-native` URL을 계속 사용한다.
- Alternatives Considered: 새 Worker, 별도 `/updates` endpoint, asset proxy. 모두 static delivery 책임과 public path를 불필요하게 늘리므로 선택하지 않는다.
- Consequences: Rule provider의 live configuration과 target request evidence가 필요하며, 기존 `/releases/*/manifest.json` cache/header rule이 rewritten target에 적용되는지 live 검증해야 한다.
- Confirmation / Follow-up: `PROD-334`에서 valid/invalid header, target path, existing edge rule, direct asset과 provider state를 확인한다.

### Missing manifest는 static-origin 404와 Native fallback으로 처리한다

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/expo-ota.md`, `PROD-956`, `PROD-334`
- Status: Active
- Context / Problem: target channel에 아직 manifest가 없을 때 custom empty response를 만들면 update 실패를 숨기고 fallback 경계를 흐린다.
- Decision Outcome: R2 custom domain의 404를 그대로 반환하고, Native는 update 확인 실패로 원래 channel과 실행 가능한 fallback을 유지한다.
- Alternatives Considered: custom `204`, synthetic manifest 또는 다른 channel로의 자동 fallback. 승인된 failure contract와 signed update 검증을 우회하므로 선택하지 않는다.
- Consequences: 새 channel은 compatible signed release가 publish되기 전까지 전환되지 않으며, 별도 response Worker가 필요하지 않다.
- Confirmation / Follow-up: provider 404와 Native rollback을 각각 관측하고 cross-slice evidence에 연결한다.

### Channel 전환은 update 성공 뒤 login 삭제와 reload를 수행한다

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/operations/expo-ota.md`, `PROD-956`
- Status: Active
- Context / Problem: 환경과 session이 서로 다른 channel을 가리키거나 검증 전에 session을 삭제하면 복구 가능한 실행 상태를 잃을 수 있다.
- Decision Outcome: cancel/current selection은 no-op으로 두고, 다른 channel은 compatible signed update 확인·download가 모두 성공한 뒤 Native login을 삭제하고 `Updates.reloadAsync()`를 호출한다. 실패하면 기존 override와 executable fallback을 복원한다.
- Alternatives Considered: channel 선택 즉시 session 삭제, header만 바꾸고 reload, 실패 뒤 target channel 유지. 모두 원래 실행 상태 보장과 충돌하므로 선택하지 않는다.
- Consequences: transition은 busy 상태 동안 중복 실행되지 않고, 404·signature·asset·download 실패는 기존 channel에 남는다.
- Confirmation / Follow-up: `PROD-956` app tests와 Native Store/device matrix에서 성공·실패·offline 결과를 확인한다.

### 구현과 archive ownership은 분리한다

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-956`, `PROD-334`, `PROD-336`
- Status: Active
- Context / Problem: Native app, Cloudflare provider, 기존 전체 OTA release/device/runbook는 서로 다른 실행 경계를 가진다.
- Decision Outcome: `PROD-956`은 Native 구현과 이 change의 최종 integration/archive를, `PROD-334`는 Rule provider delivery를 소유한다. 기존 전체 OTA change와 `PROD-336`의 release/device/runbook evidence는 유지하고 이 change가 대신 완료하지 않는다.
- Alternatives Considered: 모든 OTA와 device evidence를 이 change로 옮기는 방법. 기존 ownership과 archive gate를 깨므로 선택하지 않는다.
- Consequences: 이 change의 tasks는 live Rule와 Native release evidence 없이는 완료되지 않으며, archive는 `PROD-956`이 모든 slice 결과를 교차 확인한 뒤 수행한다.
- Confirmation / Follow-up: final integration review에서 issue ownership, old change 상태, canonical docs와 evidence links를 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
