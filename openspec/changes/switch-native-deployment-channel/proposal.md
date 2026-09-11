## Why

Native Store binary의 기본 channel은 `prod`이며, 개발·운영 환경을 바꾸려면 API, Web, OIDC와 OTA가
같은 환경으로 이동해야 한다. Native Settings와 사전 로그인 복구 화면에서 `dev`·`prod`를 선택할 수
있게 하되, 기존 static R2 release tuple과 signed update 검증을 유지해야 한다.

기존 R2 custom domain의 project-qualified manifest URL과 request header를 Cloudflare URL Rewrite Rule로
기존 tuple manifest path에 연결하면 별도 Worker나 새 endpoint 없이 이 계약을 제공할 수 있다.

## What Changes

- Native `정보`에 `dev`·`prod`만 선택하는 `채널` row/selector와 사전 로그인 복구 진입점을 제공한다.
- 선택한 channel이 Native API origin, Web origin, OIDC 로그인 환경과 OTA channel을 함께 결정하게 한다.
- Native `updates.url`을 `https://expo-ota.byulmaru.co/releases/kosmo-native`로 고정하고
  `expo-platform`, `expo-runtime-version`, `expo-channel-name` header를 사용한다.
- Cloudflare URL Rewrite Rule이 host의 `/releases/{project}` 단일 safe project path와 header 값을 기존
  `releases/{project}/{platform}/{channel}/{runtimeVersion}/manifest.json` tuple에 project를 보존해 내부
  rewrite하게 한다.
- Generic publisher의 safe channel-segment contract는 유지하고, Native selector에만 `dev`·`prod`를 노출한다.
- 호환 signed update 확인·download가 성공한 뒤에만 Native login 삭제와 reload를 수행하고, 404·검증·download
  실패에서는 원래 channel과 실행 가능한 fallback을 유지한다.
- 기존 `/releases/*` manifest/assets, cache·response-header 규칙과 public publisher를 유지한다.
- Native client/integration은 `PROD-956`, Cloudflare Rule 제공은 `PROD-334`가 소유하며, 기존 전체 OTA
  release/device/runbook 범위와 `PROD-336` 및 `self-host-expo-ota` change는 별도로 유지한다.

## Authority / Provenance

- Canonical: `docs/design/settings.md`, `docs/design/breakpoints.md`, `docs/operations/expo-ota.md`, `docs/operations/sentry.md`
- Linear Contract: `PROD-956`, `PROD-334`
- Linear Implementations: `PROD-956`, `PROD-334`; existing OTA `PROD-336`

## Capabilities

### New Capabilities

- `native-deployment-channel`: Native channel selector, environment coupling, signed update transition and fallback contract
- `expo-ota-rewrite`: Project-qualified R2 custom-domain manifest path and header-driven Cloudflare rewrite to the existing tuple

### Modified Capabilities

- 없음.

## Impact

- `apps/app`: Native Settings/pre-login selector, public configuration selection, OTA request and session/reload flow
- Cloudflare zone rule: project-qualified manifest path and request-header-based URI rewrite
- Existing R2 object layout, static manifest/assets, cache/response-header behavior and `byulmaru/expo-ota` publisher: preserved
- Web Settings and Web channel selection UI: unchanged
- Native release/device and live Cloudflare evidence: required before this change can be completed or archived
