## Why

Native에서 API·Web·OIDC·Sentry와 OTA channel을 함께 바꾸고, 호환 update가 확인된 뒤에만 실행 상태를
전환할 수 있어야 한다. 고정된 project URL과 기존 signed static R2 tuple을 유지하면서 이 흐름을 제공한다.

## What Changes

- Native `정보`와 사전 로그인 복구에 `dev`·`prod` channel selector를 추가한다.
- 선택값을 API·Web·OIDC·Sentry·OTA environment에 공통 적용한다.
- `https://expo-ota.byulmaru.co/releases/kosmo-native`의 request headers를 기존 tuple manifest로 rewrite한다.
- 호환 signed update 성공 뒤 login 삭제·reload를 수행하고, 실패 시 기존 channel/fallback을 유지한다.
- Web channel UI, publisher/static tuple, 기존 edge rules와 전체 OTA/device 운영 범위는 유지한다.

## Authority / Provenance

- Canonical: `docs/design/settings.md`, `docs/design/breakpoints.md`, `docs/operations/expo-ota.md`, `docs/operations/sentry.md`
- Contract: [PROD-956](https://linear.app/byulmaru/issue/PROD-956), [PROD-334](https://linear.app/byulmaru/issue/PROD-334)
- Existing OTA ownership: [PROD-336](https://linear.app/byulmaru/issue/PROD-336)

## Capabilities

### New Capabilities

- `native-deployment-channel`
- `expo-ota-rewrite`

### Modified Capabilities

없음.

## Impact

- `apps/app`: Native selector, shared environment mapping, OTA transition and request headers
- Cloudflare zone: project-qualified manifest rewrite to existing static R2 tuple
- Existing publisher, manifest/assets, Web surfaces and `self-host-expo-ota`: unchanged
- Native Store/device and Cloudflare live evidence: required before completion/archive
