## Why

Kosmo의 Android·iOS 테스트 바이너리는 현재 Google Play Alpha 비공개 테스트와 TestFlight 내부 테스트로 전달되지만, 호환되는 JavaScript·asset 변경에도 새 스토어 바이너리와 배포를 반복해야 한다. `PROD-331`의 자체 호스팅 Expo OTA change는 호환성·서명·무결성·불변 release·복구 경계를 한 계약으로 고정하고, 실제 구현 이슈가 같은 검증 가능한 결과를 완성하도록 해야 한다.

## What Changes

- SDK 56 Expo client가 embedded update와 자체 update service를 동일한 runtimeVersion·project namespace 계약으로 연결하고, 호환되지 않거나 서명·asset hash 검증에 실패한 update를 적용하지 않도록 한다.
- 조직 공용 정적 Cloudflare R2 delivery 경계를 추가한다. 정적 R2 origin과 multipart publisher Action·재사용 workflow는 public `byulmaru/expo-ota` repository가 소유하고, Kosmo repository는 client와 승인된 export 및 publish 호출 workflow를 소유한다. R2는 고정된 `releases/{project}/{platform}/{channel}/{runtime}` 경로에서 이미 서명된 multipart manifest와 content-addressed asset을 그대로 제공하며, 동적 Worker가 요청별로 release를 선택하거나 서명을 수행하지 않는다. 요청은 논리 project namespace `kosmo-native`와 `platform`(`ios`/`android`), OTA `channel`(`staging`/`production`)을 구분하고, `runtimeVersion`만으로 project를 식별하지 않는다.
- publisher는 `multipart/mixed` manifest의 JSON part를 정확한 바이트로 서명하고 asset을 먼저 업로드·read-back 검증한 뒤 고정 tuple manifest object를 갱신한다. staging 검증 후 production promotion과 known-good 정상 update 재발행 recovery는 새 destination manifest/release record를 만들며, content-addressed asset bytes를 덮어쓰지 않는다. offline·실패 검증을 운영 결과로 남긴다.
- completed PROD-886 Google Play Alpha 및 PROD-876 TestFlight 경로로 새 OTA-enabled seed binary를 배포해 Android·iOS 실기기에서 update, rejection, offline fallback, recovery를 검증한다.
- OTA staging/production과 Native public-config `dev`/`prod`를 별도 축으로 유지하고 두 OTA channel 모두 release binary의 Native public-config `prod`를 사용한다.
- EAS, percentage/user targeting, admin UI, public store release, native code/SDK 변경의 OTA 전달은 범위에서 제외한다.

## Authority / Provenance

- Canonical: 적용되는 제품 도메인 객체·행동 계약 없음; `docs/domain/README.md`, `docs/design/README.md`를 확인했으며 UI/도메인 canonical 변경은 이 change에 포함하지 않는다.
- Human-approved repository boundary: public `byulmaru/expo-ota` owns the organization-shared static R2 endpoint configuration and multipart publisher Action/reusable workflow; Kosmo owns the client, approved export, and publish/promotion orchestration. The current handoff uses public base URL `https://expo-ota.byulmaru.co` and R2 bucket `expo-ota`; live response and object evidence remains part of the release verification. Static R2 serving is read-only and never receives a signing private key. The publisher job reads the signing private key from Vault only for the release operation, while the public certificate is embedded in each native seed binary.
- Linear Contract: [PROD-331](https://linear.app/byulmaru/issue/PROD-331/자체-호스팅-expo-ota-업데이트를-도입한다), [PROD-332](https://linear.app/byulmaru/issue/PROD-332/자체-호스팅-expo-ota-계약과-구현-경계를-승인한다)
- Linear Implementations: [PROD-333](https://linear.app/byulmaru/issue/PROD-333/엑스포-앱에-자체-ota-bootstrap과-코드서명을-구성한다), [PROD-334](https://linear.app/byulmaru/issue/PROD-334/cloudflare-worker와-r2로-expo-updates-delivery를-제공한다), [PROD-335](https://linear.app/byulmaru/issue/PROD-335/자체-ota-release-발행승격복구-파이프라인을-구축한다), [PROD-336](https://linear.app/byulmaru/issue/PROD-336/자체-ota의-실기기-검증과-운영-runbook을-완성한다). Android seed 경로는 완료된 [PROD-886](https://linear.app/byulmaru/issue/PROD-886)을 현재 경로로 사용하고, [PROD-285](https://linear.app/byulmaru/issue/PROD-285)는 과거 Google Play Internal 경로로만 기록한다. iOS seed 경로는 완료된 [PROD-876](https://linear.app/byulmaru/issue/PROD-876)이다.

## Capabilities

### New Capabilities

- `expo-ota-client-compatibility`: Android·iOS Expo client의 update URL/bootstrap, runtime/project/channel 호환성, manifest 서명 및 asset 무결성 검증과 embedded fallback 계약
- `expo-ota-delivery`: 조직 공용 정적 Cloudflare R2의 namespace-aware multipart manifest·asset 조회, immutable asset storage와 fixed tuple manifest delivery 계약
- `expo-ota-release-lifecycle`: signed release 발행, staging 검증, production promotion, known-good recovery, credential/key rotation 경계와 운영 증거 계약

### Modified Capabilities

- 없음. 기존 `universal-expo-client`의 일반적인 플랫폼·build 계약을 변경하지 않고, OTA 행동 계약은 새 capability로 분리한다.

## Impact

- `apps/app`: Expo SDK 56 app config, `expo-updates` bootstrap, code signing, runtime/project/channel metadata와 client fallback 검증
- `byulmaru/expo-ota` (public): 조직 공용 정적 R2 endpoint 설정, multipart manifest·asset 경로, publisher Action/reusable workflow와 read-only object delivery
- Kosmo release tooling/CI: 승인된 app export, publisher 호출·promotion orchestration, signed immutable artifact 검증 및 recovery·rotation evidence
- `.github/workflows`: PROD-886 Google Play Alpha와 PROD-876 TestFlight의 OTA-enabled seed binary 및 device verification handoff
- 운영/보안: signing private key는 Vault에서 publisher job 실행 중에만 읽고 client·정적 R2 runtime에 두지 않는다. `2026-09` 초기 private key는 Vault KV v2 `secret/data/expo-ota/signing/kosmo-native/2026-09`의 `private_key` field, version 1로 등록되었고, 공개 certificate는 `apps/app/certs/certificate.pem`에 둔다. certificate 유효기간은 2026-09-10~2027-09-10(KST), 첫 6개월 rotation 예정일은 2027-03-10이며, publisher read·rotation·seed binary·device evidence는 별도로 남긴다.
