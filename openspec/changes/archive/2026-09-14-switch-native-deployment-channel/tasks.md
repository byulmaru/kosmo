## 1. PROD-956 — Native client and integration

**Authority / Provenance**

- `docs/design/settings.md`, `docs/design/breakpoints.md`
- `docs/operations/expo-ota.md`, `docs/operations/sentry.md`, PROD-956

**Deliverable**

인증된 Native `정보`에서만 `dev`·`prod`를 선택하고, API·Web·OIDC·Sentry·OTA를 함께 전환한다.

**Guardrails**

- Web channel/info UI와 policy links는 변경하지 않는다.
- Store 기본값은 `prod`; fixed URL/header와 generic publisher contract를 유지한다.
- 로그인 화면에는 channel selector나 복구 진입점을 두지 않으며, 로그인하지 못하면 앱 내부에서 channel을 되돌릴 수 없다.
- Update 확인·download 성공 뒤에만 login 삭제/reload하고, 실패 시 원래 channel/fallback을 유지한다.

**Verification**

Focused Native/app checks와 로그인 route 실제 렌더링, 접근성·환경 mapping을 검증한다. 기존 implementation/CI
evidence와 Rule live evidence는 final cross-slice에 연결하며, Native Store/device success/rollback/signature/offline
검증은 PROD-336의 외부 OTA 운영 후속 검증으로 남긴다.

- [x] 1.1 Native authenticated `정보` selector 및 current/busy/error/no-op 동작을 연결한다.
- [x] 1.2 shared environment mapping과 fixed OTA URL/request headers를 연결한다.
- [x] 1.3 compatible signed update 성공 뒤 login 삭제/reload를 수행하고 실패 시 원래 상태를 복원한다.
- [x] 1.4 로그인 route에서 Native channel selector/recovery entry 미노출을 실제 렌더링으로 검증하고, 인증 실패 시 앱 내부 channel rollback 부재를 기록한다.

## 2. PROD-334 — Cloudflare Rewrite Rule delivery

**Authority / Provenance**

- `docs/operations/expo-ota.md`, `docs/operations/expo-ota-url-rewrite.json`
- PROD-334, PROD-956

**Deliverable**

Cloudflare가 `/releases/{project}` queryless GET과 required headers를 project-preserving static R2 tuple manifest로
rewrite한다.

**Guardrails**

- 새 Worker/public path, synthetic response 또는 asset proxy를 만들지 않는다.
- project, platform, generic safe channel과 runtime을 모두 사용하고 missing tuple은 static 404로 둔다.
- 기존 manifest/assets, publisher, cache bypass와 response-header transform을 유지한다.

**Verification**

Active Rule `expo_ota_manifest_header_route` (ID `a8d13899b9884eeb9cc4088d22942701`)와 queryless
`kosmo-native` dev iOS/Android 200, direct tuple/body/header equality, immutable assets, invalid/missing 404를
live edge에서 확인했다. Exact snapshot values는 `PROD-334`에 기록하며 query-bearing probe는 지원 범위에서 제외한다.

- [x] 2.1 project-qualified path와 required headers를 project-preserving tuple manifest로 rewrite하는 Rule을 배포한다.
- [x] 2.2 valid/invalid safe-segment matrix와 missing manifest 404, no synthetic response를 검증한다.
- [x] 2.3 rewritten manifest의 기존 edge response와 direct assets/publisher 경계를 확인한다.

## 3. PROD-956 — Final integration and archive

**Authority / Provenance**

- `docs/design/settings.md`, `docs/operations/expo-ota.md`
- PROD-956, PROD-334, PROD-336, `openspec/changes/self-host-expo-ota/`

**Deliverable**

Native와 Rule 결과를 canonical docs, Linear contract와 OpenSpec에 대조하고 이 change의 declared scope 완료 뒤 archive한다.

**Guardrails**

- Local tests만으로 완료하지 않는다.
- Existing implementation/CI와 live Cloudflare evidence를 이 change의 cross-slice 기준으로 사용한다. Native Store/device evidence는 `PROD-336` 외부 후속 운영 검증이며 이 change의 archive를 막지 않는다.
- 기존 PROD-336 및 `self-host-expo-ota` ownership을 대신 완료하지 않는다.

**Verification**

기존 implementation/CI evidence와 Cloudflare valid/404/direct-asset live evidence를 cross-check하고 strict
validation과 final consistency review를 통과한다.

- [x] 3.1 현재 app/Rule 구현·CI/live evidence와 canonical docs/Linear/OpenSpec contract를 cross-check한다.
- [x] 3.3 이 change의 declared scope 완료 뒤 final consistency review와 archive를 수행한다.
