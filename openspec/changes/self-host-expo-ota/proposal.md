## Why

Kosmo의 Android·iOS 테스트 바이너리는 현재 Google Play Alpha 비공개 테스트와 TestFlight 내부 테스트로 전달되지만, 호환되는 JavaScript·asset 변경에도 새 스토어 바이너리와 배포를 반복해야 한다. `PROD-331`의 자체 호스팅 Expo OTA change는 호환성·서명·무결성·불변 release·복구 경계를 한 계약으로 고정하고, 실제 구현 이슈가 같은 검증 가능한 결과를 완성하도록 해야 한다.

## What Changes

- SDK 56 Expo client가 embedded update와 자체 update service를 동일한 runtimeVersion·project namespace 계약으로 연결하고, 호환되지 않거나 서명·asset hash 검증에 실패한 update를 적용하지 않도록 한다.
- 조직 공용 정적 Cloudflare R2 delivery 경계를 추가한다. 정적 R2 origin과 multipart publisher Action·재사용 workflow는 public `byulmaru/expo-ota` repository가 소유하고, Kosmo repository는 client와 승인된 export 및 publish 호출 workflow를 소유한다. R2는 고정된 `releases/{project}/{platform}/{channel}/{runtime}` 경로에서 이미 서명된 multipart manifest와 content-addressed asset을 그대로 제공하며, 동적 Worker가 요청별로 release를 선택하거나 서명을 수행하지 않는다. 요청은 논리 project namespace `kosmo-native`와 `platform`(`ios`/`android`), 안전한 단일 path segment 형식의 OTA `channel`을 구분하고, `runtimeVersion`만으로 project를 식별하지 않는다.
- 기존 Deploy Dev 실행은 기존 Docker Build `head_sha`를 source로 OTA `dev` channel에 발행하고, Deploy Production 실행은 production preflight의 approved target SHA와 기존 `prod` Environment 승인 경계를 사용해 OTA `prod` channel에 발행한다. 이 OTA 발행 연결은 native-store-distribution의 binary upload 단계와 분리한다.
- publisher는 `multipart/mixed` manifest의 JSON part를 정확한 바이트로 서명하고 asset을 먼저 업로드·read-back 검증한 뒤 고정 tuple manifest object를 갱신한다. 이번 구현에서는 channel별 직접 발행 연결까지만 다루며, release promotion과 known-good recovery reissue는 후속 운영 범위로 보류한다. offline·실패 검증을 운영 결과로 남긴다.
- completed PROD-886 Google Play Alpha 및 PROD-876 TestFlight 경로로 새 OTA-enabled seed binary를 배포해 Android·iOS 실기기에서 update, rejection, offline fallback을 검증한다. recovery 검증은 보류한다.
- Deploy workflow는 논리적으로 `dev`/`prod` channel에 발행하고, client·delivery는 이름 목록을 제한하지 않고 안전한 단일 path segment 형식의 OTA channel을 사용한다. Native public-config 선택은 별도 설정으로 유지한다. Store release binary의 OTA consumer channel과 Native public-config는 모두 `prod`로 고정하며, native-store-distribution에는 channel 선택 input을 두지 않는다.
- EAS, percentage/user targeting, admin UI, public store release, native code/SDK 변경의 OTA 전달은 범위에서 제외한다.

## Authority / Provenance

- Canonical: 적용되는 제품 도메인 객체·행동 계약 없음; `docs/domain/README.md`, `docs/design/README.md`를 확인했으며 UI/도메인 canonical 변경은 이 change에 포함하지 않는다.
- Human-approved repository boundary: public `byulmaru/expo-ota` owns the organization-shared static R2 endpoint configuration and multipart publisher Action/reusable workflow; Kosmo owns the client, approved export, and deploy channel publish handoff. The current handoff uses public base URL `https://expo-ota.byulmaru.co` and R2 bucket `expo-ota`; endpoint/object response inspection is delivery operational context rather than a PROD-335 caller verification requirement. Static R2 serving is read-only and never receives a signing private key. The signing private key remains stored in Vault and is also stored as the Kosmo repository secret `EXPO_OTA_SIGNING_PRIVATE_KEY`. Deploy Dev and Deploy Production pass that repository secret to the local reusable workflow's required `signing_private_key` input, and the local workflow forwards the same input to the public publisher. The Vault value and Kosmo repository secret are synchronized on rotation. The public `byulmaru/expo-ota` repository does not store the private key. The publisher interface does not choose or require a signing storage path, field, provider, or backend. The public certificate is embedded in each native seed binary. Promotion/recovery orchestration is deferred.
- Linear Contract: [PROD-331](https://linear.app/byulmaru/issue/PROD-331/자체-호스팅-expo-ota-업데이트를-도입한다), [PROD-332](https://linear.app/byulmaru/issue/PROD-332/자체-호스팅-expo-ota-계약과-구현-경계를-승인한다)
- Linear Implementations: [PROD-333](https://linear.app/byulmaru/issue/PROD-333/엑스포-앱에-자체-ota-bootstrap과-코드서명을-구성한다), [PROD-334](https://linear.app/byulmaru/issue/PROD-334/cloudflare-worker와-r2로-expo-updates-delivery를-제공한다), [PROD-335](https://linear.app/byulmaru/issue/PROD-335/자체-ota-release-발행승격복구-파이프라인을-구축한다), [PROD-336](https://linear.app/byulmaru/issue/PROD-336/자체-ota의-실기기-검증과-운영-runbook을-완성한다). Android seed 경로는 완료된 [PROD-886](https://linear.app/byulmaru/issue/PROD-886)을 현재 경로로 사용하고, [PROD-285](https://linear.app/byulmaru/issue/PROD-285)는 과거 Google Play Internal 경로로만 기록한다. iOS seed 경로는 완료된 [PROD-876](https://linear.app/byulmaru/issue/PROD-876)이다.

## Capabilities

### New Capabilities

- `expo-ota-client-compatibility`: Android·iOS Expo client의 update URL/bootstrap, runtime/project/channel 호환성, manifest 서명 및 asset 무결성 검증과 embedded fallback 계약
- `expo-ota-delivery`: 조직 공용 정적 Cloudflare R2의 namespace-aware multipart manifest·asset 조회, immutable asset storage와 fixed tuple manifest delivery 계약
- `expo-ota-release-lifecycle`: deploy별 signed release 발행, 논리 deploy mapping(`dev`/`prod`)과 안전한 channel 형식 검증, credential/key rotation 경계와 운영 증거 계약. release promotion과 known-good recovery는 후속 범위로 보류한다.

### Modified Capabilities

- 없음. 기존 `universal-expo-client`의 일반적인 플랫폼·build 계약을 변경하지 않고, OTA 행동 계약은 새 capability로 분리한다.

## Impact

- `apps/app`: Expo SDK 56 app config, `expo-updates` bootstrap, code signing, runtime/project/channel metadata와 client fallback 검증
- `byulmaru/expo-ota` (public): 조직 공용 정적 R2 endpoint 설정, multipart manifest·asset 경로, publisher Action/reusable workflow와 read-only object delivery
- Kosmo release tooling/CI: 승인된 app export, deploy channel별 publisher 호출, signed immutable artifact 검증 및 rotation evidence. promotion/recovery orchestration은 보류한다.
- `.github/workflows`: PROD-886 Google Play Alpha와 PROD-876 TestFlight의 OTA-enabled seed binary 및 device verification handoff
- 운영/보안: signing private key는 Vault 원본과 Kosmo repository secret `EXPO_OTA_SIGNING_PRIVATE_KEY`에 함께 보관한다. Deploy Dev/Production caller는 이 repository secret을 local reusable workflow의 required `signing_private_key` input으로 전달하고, local workflow는 같은 이름의 secret을 public publisher에 전달한다. 두 저장소의 실제 등록·동기화와 publish 실행 결과는 운영 evidence로 확인하며, private key는 client·정적 R2 runtime과 job output·log·artifact에 두지 않는다. public `byulmaru/expo-ota` repository에는 private key를 저장하지 않는다. common publisher는 signing storage 경로·field·provider·backend를 고정하거나 직접 조회하지 않는다. `2026-09` 초기 private key는 Vault KV v2 `secret/data/expo-ota/signing/kosmo-native/2026-09`의 `private_key` field, version 1에 등록된 것으로 기록되었고, 공개 certificate는 `apps/app/certs/certificate.pem`에 둔다. certificate 유효기간은 2026-09-10~2027-09-10(KST), 첫 6개월 rotation 예정일은 2027-03-10이며, repository secret registration·caller forwarding·rotation·seed binary·device evidence는 별도로 남긴다.

이번 구현의 active scope는 deploy의 논리 `dev`/`prod` channel mapping, 안전한 단일 path segment 형식의 generic OTA channel handoff, 그리고 Store binary의 고정 `prod` consumer channel이다. 기존 complete-release promotion과 known-good recovery 계약은 장기 운영 맥락으로 보존하되 현재 구현에서는 보류하며, 이를 위해 별도 이슈를 만들지 않는다.
