## 1. PROD-332 — 계약과 OpenSpec Gate handoff

**Authority / Provenance**

- `PROD-331`
- `PROD-332`
- `PROD-333`, `PROD-334`, `PROD-335`, `PROD-336`

**Deliverable**

자체 호스팅 Expo OTA의 client·delivery·release·device 검증 계약과 이슈별 구현/검증 책임이 명시적 사용자 승인을 받을 수 있는 닫힌 OpenSpec Gate 결과.

**Guardrails**

- 이 change를 PROD-332의 spec-only 결과로 닫지 않고 PROD-333~336의 구현 handoff와 공유 change 책임을 함께 연결한다.
- OTA project/platform/channel/runtime tuple, Native public-config 분리, native-over-OTA 제외, current seed path와 archive 소유권을 계약에서 일관되게 유지한다.
- public `byulmaru/expo-ota`가 static R2 endpoint와 multipart publisher Action/reusable workflow를 소유하고 Kosmo가 client·approved export·channel별 publish handoff workflow를 소유하는 repository boundary와 delivery read-only/no-private-key 경계를 handoff에 고정한다. promotion/recovery는 보류한다.

**Verification**

- `openspec validate self-host-expo-ota --strict`가 통과한다.
- PROD-333~336 각각의 Deliverable·Verification·의존 순서와 PROD-336 최종 cross-slice verification/archive 책임을 사람이 승인한다.
- Issue Gate의 최신 PROD-331~336 본문·relations를 다시 읽어 current Android PROD-886와 iOS PROD-876 seed path가 handoff와 일치함을 확인한다.

- [x] 1.1 명세·설계·결정·tasks의 범위, 제외 항목, tuple과 이슈별 owner 및 승인된 repository boundary를 함께 검토해 OpenSpec Gate 승인 목록을 준비한다.
- [x] 1.2 명시적 사용자 승인 후 PROD-333·334 병렬 구현, PROD-335 후속 구현, PROD-336 통합 검증·archive 순서를 cross-repository handoff evidence에 연결한다.

## 2. PROD-333 — Expo client bootstrap·code signing·seed binary

**Authority / Provenance**

- `PROD-331`
- `PROD-332`
- `PROD-333`
- `PROD-886` (completed Google Play Alpha/private testing seed path)
- `PROD-876` (completed TestFlight internal testing seed path)

**Deliverable**

Android·iOS Expo SDK 56 release binary가 static update service에서 `kosmo-native`·platform·OTA channel·runtimeVersion을 사용하고, bundled public certificate로 검증되는 호환 `multipart/mixed` JavaScript/asset update만 적용하며, 실패 시 valid fallback을 유지하는 client와 OTA-enabled seed binary.

**Guardrails**

- Deploy mapping의 논리 `dev`/`prod`와 Native public-config `dev|prod`를 별도 축으로 유지한다. OTA channel은 이름 목록을 제한하지 않고 안전한 단일 path segment 형식으로 검증하며, Store release binary의 OTA consumer channel과 Native public-config는 모두 `prod`로 고정한다.
- runtimeVersion만으로 project를 식별하지 않고 project/platform/channel/runtime을 함께 검증한다.
- `multipart/mixed` manifest JSON part의 signature와 asset hash를 bundled public certificate로 확인하며 native module·SDK·native code 변경은 OTA로 적용하지 않는다.

**Verification**

- client unit/integration checks cover matching tuple success, mismatched runtime/project/platform/channel rejection, invalid signature/hash rejection, offline startup, and embedded/last-known-good fallback. recovery reissue verification is deferred.
- Android OTA-enabled seed binary가 completed PROD-886 Google Play Alpha 경로로 배포되고 artifact/version/runtime metadata가 기록된다.
- iOS OTA-enabled seed binary가 completed PROD-876 TestFlight 경로로 배포되고 artifact/version/runtime metadata가 기록된다.

- [x] 2.1 Expo SDK 56 client bootstrap과 build metadata를 update service tuple 및 code-signing contract에 연결하고 Native public-config 선택과 분리한다. Evidence: fixed update service URL, fingerprint runtimeVersion, OTA channel metadata, `2026-09` Vault key registration, and `apps/app/certs/certificate.pem` public certificate source are recorded across the client/build configuration and credential evidence. 인증서 validity는 2026-09-10~2027-09-10(KST)이며 첫 rotation 예정일은 2027-03-10이다.
- [ ] 2.2 compatible update 적용, runtime/namespace/signature/hash rejection, offline/fallback 동작을 검증한다.
- [ ] 2.3 PROD-886 Android와 PROD-876 iOS 경로에서 OTA-enabled seed binary를 새로 빌드·배포하고 immutable artifact identity와 runtime metadata를 기록한다.

## 3. PROD-334 — 조직 공용 static R2 delivery

**Authority / Provenance**

- `PROD-331`
- `PROD-332`
- `PROD-334`
- `PROD-335`

**Deliverable**

public `byulmaru/expo-ota` repository의 조직 공용 static R2 endpoint와 publisher Action/reusable workflow가 trusted `kosmo-native`·platform·OTA channel·runtime tuple의 `multipart/mixed` manifest와 immutable asset을 read-only 제공하고, 완전하게 검증된 release만 fixed tuple manifest object로 노출하는 delivery.

**Guardrails**

- namespace는 fixed URL path로 결정하며 runtimeVersion 단독으로 project를 선택하지 않는다. channel은 이름 목록이 아니라 slash·empty·`.`·`..`를 제외한 safe single path segment 형식으로 검증한다.
- manifest와 asset bytes는 immutable identity로 제공하고 partial upload·검증 실패 시 기존 complete release를 훼손하지 않는다.
- static R2 runtime에는 signing private key나 publishing credential을 두지 않고 invalid/unknown release는 fail closed 한다.
- static R2 source와 publisher workflow는 Kosmo repository에 복제하지 않고 `byulmaru/expo-ota`에서만 변경한다.

**Verification**

- namespace/platform/channel isolation, compatible runtime lookup, unknown/malformed release rejection을 자동 검증한다.
- complete manifest와 모든 asset 검증 전 fixed tuple manifest object가 바뀌지 않으며, published asset bytes가 in-place로 변하지 않음을 확인한다.
- runtime configuration inspection에서 static delivery가 서명·publish credential을 보유하지 않고 object bytes를 read-only로 제공함을 증명한다.

- [ ] 3.1 canonical tuple을 기준으로 manifest·asset read-only delivery와 platform/channel namespace isolation을 구현한다.
- [ ] 3.2 complete-release gate와 immutable asset/fixed tuple manifest object 동작, invalid release fail-closed 동작을 검증한다.
- [ ] 3.3 delivery runtime의 credential boundary와 client가 소비하는 manifest/asset 응답의 호환성을 PROD-333과 함께 확인한다.

## 4. PROD-335 — signed release 발행·channel handoff (promotion/recovery 보류)

**Authority / Provenance**

- `PROD-331`
- `PROD-332`
- `PROD-334`
- `PROD-335`
- `PROD-336`

**Deliverable**

Kosmo repository의 approved app export와 deploy channel handoff가 caller-provided reusable workflow secret `signing_private_key`를 사용해 `byulmaru/expo-ota` multipart publisher를 호출하고, signed immutable release를 선택된 `dev` 또는 `prod` channel에 발행하며, static R2 read-only delivery가 이를 제공하는 pipeline과 runbook. Vault 보관값을 reusable workflow input으로 연결하는 방법과 실제 handoff는 미검증 운영 연결이며 완료된 것으로 기록하지 않는다. common publisher는 signing storage path·field·provider·backend를 고정하거나 직접 조회하지 않는다. release promotion과 known-good recovery reissue는 이번 구현에서 보류한다.

**Guardrails**

- `dev` 또는 `prod` channel 검증 실패 또는 incomplete artifact는 해당 channel의 fixed tuple manifest object를 변경하지 않는다.
- Deploy Dev는 Docker Build `workflow_run.head_sha`, Deploy Production은 canonical preflight의 approved target SHA와 기존 `prod` Environment 승인을 사용한다.
- native-store-distribution은 OTA publisher를 호출하지 않고 Store binary의 OTA consumer channel을 `prod`로 고정한다.
- signing private key와 release credential은 client·static R2 runtime에 두지 않는다. Kosmo caller는 reusable publisher workflow의 caller secret `signing_private_key`를 제공하고, Vault 보관값을 해당 입력으로 연결하는 방법과 실제 handoff는 미검증 상태로 유지한다. common publisher는 전달된 입력만 사용하며 signing storage path·field·provider·backend를 고정하지 않는다.
- static R2 source·publisher workflow는 `byulmaru/expo-ota`에서 소유하고, approved app export와 channel별 publish handoff는 Kosmo에서 소유한다.

**Verification**

- signed release 생성 → 선택된 `dev`/`prod` manifest·asset·compatibility 검증의 artifact, manifest identity, asset hash와 fixed tuple manifest object evidence를 확인한다.
- channel publish failure, fixed tuple manifest object update failure, missing asset, invalid signature 시 현재 serving complete release가 유지됨을 재현한다.
- Deploy Dev의 `workflow_run.head_sha`, Deploy Production의 approved target SHA와 `prod` Environment approval, native Store workflow와의 분리 evidence를 확인한다. promotion/recovery evidence는 보류한다.
- Kosmo caller의 Vault 보관/private-key read와 reusable workflow caller secret `signing_private_key` input linkage, 1년 signing certificate validity, 6개월 rotation 경계와 새 runtime·Store binary 및 구 runtime certificate 유지 evidence가 runbook에 기록된다. 초기 `2026-09` key registration과 public certificate validity evidence는 기록되었고, caller read·workflow input linkage·rotation·seed binary·device proof는 남은 작업이다.

- [ ] 4.1 signed immutable artifact의 complete-release 검증과 safe channel segment 형식 검증을 구현하고 native code/module/SDK 요구 artifact를 새 Store binary 경로로 보낸다.
- [ ] 4.2 Deploy Dev의 `workflow_run.head_sha`와 Deploy Production의 approved target SHA를 각각 `dev`/`prod` channel publish handoff에 연결하고 native Store upload과 분리한다. promotion은 보류한다.
- [ ] 4.3 Vault credential 경계와 rotation runbook, channel publish/failure evidence를 완성한다. known-good recovery reissue와 recovery evidence는 보류한다.

## 5. PROD-336 — 실기기 검증·운영 runbook·최종 archive

**Authority / Provenance**

- `PROD-331`
- `PROD-332`
- `PROD-333`
- `PROD-334`
- `PROD-335`
- `PROD-336`
- `PROD-886` (completed Google Play Alpha/private testing seed path)
- `PROD-876` (completed TestFlight internal testing seed path)

**Deliverable**

새 OTA-enabled Android/iOS seed binary를 실제 기기에 설치해 update·rejection·offline fallback을 증명하고, client·delivery·release 결과의 tuple/manifest/asset 정합성을 확인한 운영 runbook과 shared OpenSpec archive. recovery 검증은 보류한다.

**Guardrails**

- Android는 PROD-886 Google Play Alpha, iOS는 PROD-876 TestFlight seed path를 사용한다.
- PROD-287은 store-native automation의 related context이며 OTA-specific device verification의 blocker가 아니다.
- 실기기 evidence에는 platform, binary identity, runtimeVersion, OTA channel, release/manifest identity, observed result를 남긴다.
- 모든 slice의 구현·검증 evidence가 연결된 뒤에만 shared change를 archive한다.
- 보류된 promotion/recovery 항목은 archive gate의 완료 조건으로 요구하지 않는다.

**Verification**

- Android·iOS 각 device에서 compatible update 성공, mismatched/invalid update rejection, offline startup을 수행하고 결과를 보존한다. known-good recovery는 보류한다.
- PROD-333 client, PROD-334 delivery, PROD-335 release evidence의 canonical tuple과 manifest/asset identity를 cross-check한다.
- 운영 runbook이 channel publish/failure/rotation 절차와 resume condition을 설명하며 실제 결과와 일치한다. promotion/recovery 절차는 보류 상태로 기록한다.
- `openspec validate self-host-expo-ota --strict`와 최종 consistency review가 통과하고 archive commit/evidence가 연결된다.

- [ ] 5.1 PROD-886 Android Alpha와 PROD-876 iOS TestFlight OTA-enabled seed binary를 실제 기기에 설치하고 성공·거부·offline matrix를 실행한다. recovery 검증은 보류한다.
- [ ] 5.2 client/delivery/release evidence의 tuple, release/manifest identity, asset hash와 observed device result를 교차 검증하고 불일치를 수정 요청한다.
- [ ] 5.3 운영 runbook과 final completion evidence를 갱신한 뒤 shared OpenSpec을 archive하고 PROD-331 parent completion 판단에 archive link를 전달한다.
