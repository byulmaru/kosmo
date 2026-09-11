## 1. PROD-956 — Native client and integration

**Authority / Provenance**

- `docs/design/settings.md`, `docs/design/breakpoints.md`
- `docs/operations/expo-ota.md`, `docs/operations/sentry.md`, PROD-956

**Deliverable**

Native `정보`와 사전 로그인 복구에서 `dev`·`prod`를 선택하고, API·Web·OIDC·Sentry·OTA를 함께 전환한다.

**Guardrails**

- Web channel/info UI와 policy links는 변경하지 않는다.
- Store 기본값은 `prod`; fixed URL/header와 generic publisher contract를 유지한다.
- Update 확인·download 성공 뒤에만 login 삭제/reload하고, 실패 시 원래 channel/fallback을 유지한다.

**Verification**

Focused Native/app checks와 접근성·환경 mapping을 검증한다. Native compile, 새 Android/iOS Store binary와
device success/rollback/signature/offline evidence는 별도로 연결한다.

- [x] 1.1 Native `정보`와 pre-login recovery selector 및 current/busy/error/no-op 동작을 연결한다.
- [x] 1.2 shared environment mapping과 fixed OTA URL/request headers를 연결한다.
- [x] 1.3 compatible signed update 성공 뒤 login 삭제/reload를 수행하고 실패 시 원래 상태를 복원한다.
- [ ] 1.4 focused checks와 Native Store/device verification을 `PROD-956` integration evidence에 연결한다.

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

Native와 Rule 결과를 canonical docs, Linear contract와 OpenSpec에 대조하고 전체 완료 뒤 archive한다.

**Guardrails**

- Local tests만으로 완료하지 않는다.
- Native Store/device와 live Cloudflare evidence가 모두 있어야 archive한다.
- 기존 PROD-336 및 `self-host-expo-ota` ownership을 대신 완료하지 않는다.

**Verification**

Native success/failure/offline matrix와 Cloudflare valid/404/direct-asset matrix를 cross-check하고 strict
validation과 final consistency review를 통과한다.

- [ ] 3.1 app/Rule 결과와 canonical docs/Linear/OpenSpec contract를 cross-check한다.
- [ ] 3.2 Native Store/release/device evidence와 live Rule evidence를 연결한다.
- [ ] 3.3 모든 slice 완료 뒤 final consistency review와 archive를 수행한다.
