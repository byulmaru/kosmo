## 1. PROD-956 — Native client and integration

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/design/breakpoints.md`
- `docs/operations/expo-ota.md`
- `docs/operations/sentry.md`
- `PROD-956`

**Deliverable**

Android/iOS Native가 `정보`와 사전 로그인 복구 진입점에서 `dev`·`prod` channel을 선택하고, 선택된 API·Web·OIDC·Sentry·OTA 환경을 compatible signed update 성공 뒤에만 전환하며 실패 시 기존 실행 상태를 유지한다.

**Guardrails**

- Web `정보`와 Web channel 선택 UI를 변경하지 않는다.
- Native selector는 `dev`·`prod`만 제공하고 Store 기본값은 `prod`다.
- 고정 URL과 `expo-platform`, `expo-runtime-version`, `expo-channel-name` header 계약을 유지한다.
- cancel/current selection은 no-op이며, login 삭제와 reload는 compatible update 확인·download 성공 뒤에만 수행한다.
- 404·signature·asset-hash·compatibility·download 실패에서는 기존 channel과 executable fallback을 유지한다.

**Verification**

- selector의 authenticated/pre-login 접근성 상태, dev/prod 제한과 no-op을 확인한다. Local focused Native tests
  16개와 app unit suite 552개가 통과했다.
- API·Web·OIDC·Sentry·OTA environment가 같은 선택값을 사용하는 focused tests와 runtime checks를 수행한다.
  Relay `--noWatchman`, TypeScript, targeted lint/format과 Android/iOS fingerprint resolve, prebuild, export도
  통과했다.
- Native Store binary에서 compatible success, 404/failure rollback, signature rejection과 offline fallback을 실제
  기기로 확인한다. Native compile과 Store/device live evidence는 아직 없다.

- [x] 1.1 Native `정보`와 pre-login recovery에 `채널` selector를 연결하고 current/busy/error/no-op 접근성 동작을 검증한다.
- [x] 1.2 shared channel mapping과 fixed OTA URL/request headers를 연결해 API·Web·OIDC·Sentry·OTA가 같은 environment를 선택하게 한다.
- [x] 1.3 compatible signed update 성공 뒤에만 Native login 삭제와 `Updates.reloadAsync()`를 수행하고, 404·검증·download 실패 시 원래 channel/fallback을 복원한다.
- [ ] 1.4 focused app tests와 Native Store/device verification을 실행하고 결과를 `PROD-956` integration evidence에 연결한다.

## 2. PROD-334 — Cloudflare Rewrite Rule delivery

**Authority / Provenance**

- `docs/operations/expo-ota.md`
- `PROD-334`
- `PROD-956`

**Deliverable**

Cloudflare가 host의 `/releases/{project}` 단일 safe project path와 required headers를 project path segment를
보존한 기존 `/releases/{project}/{platform}/{channel}/{runtimeVersion}/manifest.json` tuple로 내부 rewrite하여
static R2 signed manifest를 제공한다. Native app은 이 generic contract의 `kosmo-native` URL을 사용한다.

**Guardrails**

- 새 Worker, 별도 public path, synthetic manifest/empty response, asset proxy를 만들지 않는다.
- 기존 `/releases/*` manifest/assets, publisher, cache bypass와 response-header transform을 보존한다.
- project, platform, safe channel segment와 runtimeVersion을 모두 사용하며 unsafe/missing project 또는 header는
  tuple path를 만들지 않는다.
- missing tuple manifest는 static-origin 404로 남긴다.

**Verification**

- Cloudflare provider state에서 host, `/releases/{project}` path, method, required header match와
  project-preserving target path를 확인한다.
- query 없는 Native `kosmo-native` dev requests의 iOS/Android 200, direct tuple과 signed multipart body bytes 및
  Expo headers 일치, missing/unsafe header와 path의 404, missing manifest 404를 live edge에서 확인한다. Existing
  cache/header 응답과 direct immutable assets도 확인한다. Query를 붙인 probe는 body는 200으로 동일하지만
  `expo-protocol-version`/`expo-sfv-version`이 없어 이번 지원 계약의 evidence로 사용하지 않는다.

- [x] 2.1 project-qualified `/releases/{project}` GET path와 required header를 project를 보존한 기존 tuple manifest path로 rewrite하는 Cloudflare Rule을 구성한다.
- [x] 2.2 valid/invalid project·header와 safe-segment matrix, missing manifest 404를 검증하고 custom response가 없음을 확인한다.
- [x] 2.3 rewritten manifest에 기존 cache bypass/response-header transform이 적용되고 direct assets/publisher가 유지되는지 live edge에서 확인한다.

## 3. PROD-956 — Final integration and archive

**Authority / Provenance**

- `docs/design/settings.md`
- `docs/operations/expo-ota.md`
- `PROD-956`
- `PROD-334`
- `PROD-336`
- `openspec/changes/self-host-expo-ota/`

**Deliverable**

Native implementation과 Cloudflare Rule 결과를 canonical docs, Linear issue, OpenSpec requirements와 교차 검증하고, 모든 required evidence가 연결된 뒤 이 change를 archive할 수 있는 completion record를 만든다.

**Guardrails**

- 단위 테스트만으로 scope 완료를 선언하지 않는다.
- live Cloudflare Rule evidence와 Native Store/release/device evidence가 없으면 tasks를 완료하지 않는다.
- 기존 전체 OTA release/device/runbook와 `PROD-336` ownership 및 `self-host-expo-ota` change를 변경하거나 대신 archive하지 않는다.
- `PROD-956`이 integration/archive를 소유하고 `PROD-334`가 Rule delivery를 소유한다.

**Verification**

- canonical docs와 두 Linear issue의 현재 contract, app/provider diff, request/response evidence를 독립적으로 cross-check한다.
- Native success/failure/offline matrix와 Cloudflare valid/404/direct-asset matrix가 모두 보존되었는지 확인한다.
- `openspec validate switch-native-deployment-channel --strict`와 final consistency review가 통과한 뒤에만 archive한다.

- [ ] 3.1 `PROD-956` app 결과와 `PROD-334` Rule 결과를 canonical docs/Linear/OpenSpec contract와 cross-check하고 불일치를 수정한다.
- [ ] 3.2 Native Store/release/device evidence와 live Cloudflare Rule evidence를 연결한다. 기존 `PROD-336` OTA evidence는 별도 ownership으로 유지한다.
- [ ] 3.3 모든 slice와 verification이 완료된 뒤 `PROD-956`이 final consistency review를 수행하고 이 change를 archive한다.
