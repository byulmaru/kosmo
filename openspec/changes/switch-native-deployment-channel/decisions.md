## Context

This log records the approved Native channel contract and the Cloudflare delivery choice for
[PROD-956](https://linear.app/byulmaru/issue/PROD-956) and [PROD-334](https://linear.app/byulmaru/issue/PROD-334).
[PROD-956](https://linear.app/byulmaru/issue/PROD-956) owns Native integration and final consistency/archive,
[PROD-334](https://linear.app/byulmaru/issue/PROD-334) owns Rule delivery, and existing
[PROD-336](https://linear.app/byulmaru/issue/PROD-336) OTA release/device/runbook scope remains separate.

## Decision Records

### Native uses one bounded channel environment and guarded transition

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/operations/expo-ota.md`, `docs/operations/sentry.md`, PROD-956
- Status: Active
- Context / Problem: Native must move its environment and OTA channel together without changing Web behavior or losing a working executable.
- Decision Outcome: Native Settings and pre-login recovery expose only `dev`/`prod`; the selected value drives API, Web, OIDC, Sentry and OTA. A different value is applied only after a compatible signed update is verified and downloaded, then login is deleted and the app reloads. Cancel and same-value selection are no-ops; 404 and other failures restore the original channel and fallback.
- Alternatives Considered: Exposing arbitrary publisher channels or changing the channel before update success would widen scope or weaken recovery.
- Consequences: Native code/module/SDK/permission changes require new Store binaries, and device evidence remains a separate completion gate.
- Confirmation / Follow-up: Verify Native Store/device success, rollback, signature rejection and offline behavior under PROD-956.

### Project-qualified requests use Cloudflare URL Rewrite over existing R2

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/expo-ota.md`, `docs/operations/expo-ota-url-rewrite.json`, PROD-334, PROD-956
- Status: Active
- Context / Problem: The fixed Native URL carries project in the path and platform/channel/runtime in headers while existing static delivery and edge rules must remain authoritative.
- Decision Outcome: The supported contract is a queryless GET. The deployed `expo_ota_manifest_header_route` Rule validates safe project/channel/runtime and platform headers and rewrites only to the project-preserving tuple manifest path. Generic publisher channels remain broader than the Native `dev`/`prod` selector.
- Alternatives Considered: A Worker, a second public path, synthetic response or asset proxy would duplicate delivery responsibility.
- Consequences: Rule ID `a8d13899b9884eeb9cc4088d22942701` and live queryless request evidence are recorded in the operations document; query-bearing probes are outside this change.
- Confirmation / Follow-up: Keep existing manifest cache/response-header rules, direct assets and publisher behavior unchanged; retain static-origin 404 for missing tuples.

## Remaining Decisions

없음.

## Superseded Decisions

없음.
