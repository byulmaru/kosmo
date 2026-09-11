## Context

이 change는 [proposal.md](./proposal.md)의 자체 호스팅 Expo OTA 결과를 `PROD-333`~`PROD-336`이 나눠 구현하기 위한 설계 handoff다. 현재 `apps/app/app.config.ts`는 Android package와 iOS bundle identifier, Expo Router 및 SecureStore plugin을 정의하지만 `expo-updates` bootstrap·runtimeVersion·code signing 설정은 아직 계약에 맞게 연결되어 있지 않다. `apps/app/src/config/public.ts`의 Native `dev`/`prod` 공개 설정은 OTA deploy channel과 책임을 분리해 유지한다. 기존 Deploy Dev/Production workflow는 각각 정해진 source SHA와 승인 경계를 가지며, OTA 발행은 그 workflow에서 수행하고 native-store-distribution은 별도 binary upload 경로로 유지한다.

Delivery는 기존 Temporal `apps/worker`의 책임을 확장하지 않고 조직 공용 정적 Cloudflare R2 경계로 분리한다. 정적 R2 endpoint와 multipart publisher Action/reusable workflow는 public `byulmaru/expo-ota` repository가 소유하고, Kosmo는 client와 승인된 export 및 deploy publish handoff를 소유한다. Client, delivery, release pipeline은 동일한 `kosmo-native`·platform·OTA channel·runtimeVersion 계약을 공유하지만 각 구현 이슈가 자기 slice의 테스트와 결과를 소유한다. promotion/recovery orchestration은 보류한다.

## Goals / Non-Goals

**Goals:**

- Expo client가 trusted namespace와 runtimeVersion을 사용해 호환되는 signed update만 선택하도록 한다.
- 정적 Cloudflare R2가 namespace-aware read-only delivery와 multipart manifest 및 immutable asset을 제공하도록 한다.
- Deploy Dev와 Deploy Production이 각각 `dev`/`prod` channel을 선택해 signed release handoff를 수행하고, rotation 경계를 재현 가능하게 한다.
- PROD-886 Google Play Alpha와 PROD-876 TestFlight에서 새 OTA-enabled seed binary의 실기기 update·rejection·offline fallback 결과를 연결한다.

**Non-Goals:**

- EAS Update, percentage/user targeting, admin UI, public store release 자동화 또는 native code/SDK의 OTA 전달
- 기존 `apps/worker` Temporal workflow를 OTA delivery로 변환
- Kosmo repository에 조직 공용 정적 R2 source 또는 deploy config를 추가
- native-store-distribution의 binary upload를 OTA publisher 호출 지점으로 재사용하거나 channel 선택 input을 추가
- 실제 host/bucket provisioning, Vault와 Kosmo repository secret 등록 및 publish 실행 자체. 현재 handoff의 public base URL `https://expo-ota.byulmaru.co`와 R2 bucket `expo-ota`는 handoff context로 기록하며, publish 실행은 각 owner의 운영 범위에서 다룬다.

## Implementation Guidance

### Current Constraints

- `apps/app`은 Expo SDK 56이며 package manifest에 `expo-updates`가 직접 선언되어 있지 않다. SDK가 요구하는 패키지 버전과 prebuild 결과를 PROD-333이 확인해야 한다.
- `app.config.ts`에 build identity와 plugin 목록이 있으므로 runtimeVersion, 고정 tuple update URL, code-signing 설정은 이 설정과 native prebuild 결과가 일치하도록 연결해야 한다. `runtimeVersion`만으로 project를 선택하면 안 된다.
- `public.ts`는 Native 개발에서 `dev`, release에서 `prod`를 선택한다. Deploy workflow의 논리 mapping은 `dev`/`prod`를 사용하지만, OTA client·delivery는 channel 이름 목록을 제한하지 않고 안전한 단일 path segment 형식만 요구한다. 두 설정 책임을 분리하므로 OTA channel input으로 public-config를 자동 변경하지 않는다. Store binary의 OTA consumer channel은 `prod`로 고정한다.
- Android workflow는 completed PROD-886 Google Play Alpha 경로이고 iOS workflow는 completed PROD-876 TestFlight 경로다. OTA-enabled binary를 만들 때 signing과 seed artifact evidence를 잃지 않아야 한다.
- 기존 `apps/worker`와 `apps/helm/templates/worker.yaml`은 Temporal Worker runtime이다. 여기에 OTA manifest/asset route를 임의로 추가하면 delivery와 workflow의 보안 경계가 섞인다.
- 이번 구현에서는 release promotion과 known-good recovery reissue를 active scope에 포함하지 않는다. 해당 계약과 장기 운영 맥락은 decisions와 migration notes에 보존하며, publisher contract가 준비된 뒤 별도로 재개한다.
- 정적 R2 manifest는 `multipart/mixed` 응답이며 첫 JSON part의 정확한 바이트에 `expo-signature`를 붙인다. publisher는 bundle과 asset을 SHA-256 content-addressed object로 만들고, 새 asset upload에는 사전 계산한 SHA-256 표준 Base64를 R2 `PutObject`에 전달해 서버 검증한다. 이미 존재하는 immutable asset은 `IfNoneMatch: "*"`의 412 응답으로 재사용하며, 모든 asset의 upload 성공 또는 기존 존재 확인 뒤 tuple의 `manifest.json` object를 쓴다. manifest는 `private, no-store`, asset은 `public, max-age=31536000, immutable`이며 static host는 multipart bytes와 Expo protocol headers를 변형하지 않아야 한다.
- 정적 endpoint는 요청별 negotiation이나 signing을 하지 않는다. 서명·asset hash 검증은 public certificate를 포함한 client가 update 적용 전에 수행한다.
- signing private key는 Vault 원본과 Kosmo repository secret `EXPO_OTA_SIGNING_PRIVATE_KEY`에 함께 보관한다. Deploy Dev/Production의 caller publish job은 이 repository secret을 public `byulmaru/expo-ota` reusable workflow의 required `signing_private_key` input으로 직접 전달하며, local export workflow에는 secret을 전달하지 않는다. 두 저장소는 rotation 때 함께 갱신한다. 실제 secret 등록·동기화와 publish 결과는 운영 evidence로 확인하며, common publisher는 signing storage 경로·field·provider·backend를 고정하거나 직접 조회하지 않는다. public `byulmaru/expo-ota` repository와 static R2에는 private key를 저장하지 않는다. native seed binary에는 public certificate를 포함한다. `2026-09` 초기 private key는 Vault KV v2 `secret/data/expo-ota/signing/kosmo-native/2026-09`의 `private_key` field, version 1에 등록된 것으로 기록되었다. certificate validity는 `2026-09-10`부터 `2027-09-10`까지(KST)이며 첫 rotation은 `2027-03-10`에 예정되어 있다. 초기 provision과 public certificate source evidence 및 2026-09-10 10:06:24 UTC의 repository secret 등록은 기록되었고 caller forwarding 실행·rotation·seed binary·device evidence는 남은 운영 evidence로 관리한다.
- 조직 공용 정적 R2 source와 publisher workflow는 public `byulmaru/expo-ota`에서 관리한다. Kosmo에서는 delivery runtime을 복제하지 않고 client와 approved export/publish handoff만 연결한다.

### Recommended Approach

1. PROD-333이 client bootstrap을 먼저 `expo-updates`가 지원하는 native config와 앱 초기화 경계에 연결한다. approved handoff가 제공한 project/platform/channel/runtime tuple을 URL에 사용하고, channel path safety는 release/delivery contract에서 검증한다. Store binary의 OTA consumer channel과 public-config `prod` 선택은 고정하되 deploy workflow의 논리 `dev`/`prod` mapping과 분리한다.
2. manifest의 `expo-signature`와 asset hash 검증은 public certificate를 신뢰하는 client의 update 적용 직전 경계로 모으고, 오류는 last-known-good 또는 embedded update로 되돌린다. native requirement가 있는 변경은 release pipeline에서 새 store binary 경로로 보낸다.
3. PROD-334가 public `byulmaru/expo-ota` repository에서 조직 공용 정적 R2 delivery와 multipart publisher Action을 유지한다. 새 asset upload에는 사전 계산한 SHA-256 표준 Base64를 통한 R2 서버 검증을 적용하고, 이미 존재하는 content-addressed immutable object는 `IfNoneMatch: "*"`의 412 응답으로 재사용한다. 모든 asset의 upload 성공 또는 기존 존재 확인 뒤 fixed tuple manifest object를 갱신한다. 정적 endpoint는 이미 서명된 bytes만 제공하며 signing이나 요청별 release 선택을 하지 않는다.
4. Kosmo의 Deploy Dev/Production workflow가 각각 기존 approved source SHA와 승인 경계를 사용해 `dev`/`prod` channel을 선택하고 app export를 publisher에 전달한다. promotion과 recovery reissue는 이 구현에서 보류한다. native-store-distribution의 binary upload는 publisher 호출과 분리한다.
5. PROD-333이 PROD-886/PROD-876 경로용 OTA-enabled seed binary를 생성할 수 있도록 build metadata와 workflow handoff를 정리하고, PROD-336이 두 실제 기기에서 update, rejection, offline fallback을 증명한다. recovery 검증은 보류한다.
6. PROD-336은 각 slice의 결과를 canonical tuple, release identity, test binary, device, failure output과 함께 묶어 cross-slice consistency를 확인한 뒤 shared OpenSpec을 archive한다. 보류한 promotion/recovery 결과는 archive gate로 요구하지 않는다. PROD-331은 그 archive와 하위 결과가 모두 연결된 뒤 parent 완료를 판단한다.

### Allowed Alternatives

- Expo 공식 config plugin 또는 package가 제공하는 동등한 bootstrap hook을 사용할 수 있다. 단, 결과가 동일한 runtime/project/channel 선택, release/delivery contract의 안전한 channel path segment, code-signing 검증, fallback을 증명해야 한다. Client bootstrap은 별도 native prebuild 입력 검증을 추가하지 않는다. Store binary consumer channel은 `prod`로 고정하고, deploy workflow의 논리 channel mapping과 혼동하지 않는다.
- 현재 static R2 public base URL은 `https://expo-ota.byulmaru.co`, bucket은 `expo-ota`다. Host와 object layout은 PROD-334 delivery context로 기록하며, PROD-335 caller handoff에는 별도 public-edge verification 단계를 추가하지 않는다.
- CI release runner나 별도 release service가 publish를 수행할 수 있다. 단, Kosmo caller는 repository secret `EXPO_OTA_SIGNING_PRIVATE_KEY`를 local reusable workflow의 required `signing_private_key` input으로 제공하고, local workflow는 이를 public publisher에 전달한다. Vault version 1과 공개 인증서의 일치를 확인한 뒤 Kosmo repository secret을 2026-09-10 10:06:24 UTC에 등록했다. 이후 rotation 동기화와 publish handoff 실행 결과는 남은 운영 evidence로 관리한다. private key는 client·static R2 runtime에 두지 않으며, publisher가 signing storage 경로·field·provider·backend를 고정하지 않고 protected production approval과 immutable complete-release 계약을 보존해야 한다. promotion/recovery는 보류한다.

### Known Traps

- Deploy workflow의 논리 `dev`/`prod` mapping과 Native public-config는 서로의 값을 자동 재사용하지 않는다. OTA channel은 별도 generic 값으로 전달하되 안전한 단일 path segment여야 한다. Store binary는 OTA consumer와 public-config 두 축 모두 `prod`다.
- runtimeVersion만 비교하거나 project/platform/channel을 생략하면 서로 다른 binary가 잘못된 JavaScript/native API 조합을 받을 수 있다.
- manifest object를 먼저 바꾸거나 이미 공개한 asset을 덮어쓰면 partial release와 client별 다른 bytes가 발생한다.
- static R2 origin 또는 public `byulmaru/expo-ota` repository에 signing private key, Play/TestFlight credential 또는 publish token을 넣으면 read-only delivery와 repository 경계가 깨진다. Kosmo repository secret `EXPO_OTA_SIGNING_PRIVATE_KEY`는 caller 전달용으로만 사용한다.
- certificate rotation은 새 public certificate를 포함한 새 runtime과 새 Store binary를 배포하는 경계다. 구 runtime은 구 certificate를 계속 사용하며, 기존 binary에 새 certificate를 주입하거나 dual trust를 추가하지 않는다.
- Firebase App Distribution 또는 과거 PROD-285 Internal 경로를 현재 Android seed binary evidence로 재사용하면 current path인 PROD-886과 검증 결과가 불일치한다.
- PROD-287의 store-native automation을 OTA 전용 device verification의 blocker로 취급하면 독립적으로 완료 가능한 PROD-336 결과를 막게 된다.

## Risks / Trade-offs

- [Risk] static endpoint는 routing/header 설정 context만 확인되었고 positive delivery·device 적용 결과가 아직 없다. → 현재 handoff의 `https://expo-ota.byulmaru.co`와 `expo-ota`를 사용하되, 해당 결과는 PROD-334/336 slice의 운영 evidence로 별도 관리하고 PROD-335 caller handoff에는 포함하지 않는다.
- [Risk] SDK 56의 `expo-updates` native prebuild가 현재 config와 충돌할 수 있다. → PROD-333이 generated native project, local build, seed binary 설치 결과를 검증한다.
- [Risk] 1년 certificate를 6개월마다 교체하면 구 runtime과 새 runtime의 신뢰 material이 달라진다. → 새 certificate를 포함한 새 runtime·Store binary를 배포하고, 구 runtime은 구 certificate를 유지하는 rotation evidence를 기록한다.
- [Risk] offline/failure fallback은 CI만으로는 증명하기 어렵다. → PROD-336이 네트워크 차단과 invalid release를 포함한 실기기 evidence를 소유한다.

## Migration Plan

1. OpenSpec Gate에서 현재 tuple, static `byulmaru/expo-ota` delivery와 Kosmo client/release 경계, current endpoint/bucket handoff와 evidence boundary를 승인한다.
2. PROD-333과 PROD-334를 병렬 구현하고 각자의 focused verification을 연결한다.
3. 두 slice가 완료된 뒤 PROD-335가 기존 Deploy Dev/Production source SHA·approval 경계에서 `dev`/`prod` channel validation과 signed multipart publish handoff를 검증한다. promotion/recovery는 보류한다.
4. PROD-333이 생성한 새 OTA-enabled Android/iOS seed binary를 각각 PROD-886 Google Play Alpha와 PROD-876 TestFlight로 배포한다.
5. PROD-336이 실제 기기 검증과 운영 runbook, cross-slice consistency를 완료하고 OpenSpec을 archive한다.
6. 실패 시 fixed tuple manifest object를 부분 release로 변경하지 않고 embedded update로 돌아간다. native 변경이 필요한 경우 OTA rollback 대신 새 store binary를 만든다. known-good recovery reissue는 보류한다.

## Open Questions

- current static R2 endpoint `https://expo-ota.byulmaru.co`와 bucket `expo-ota`가 configured host/object와 일치하고 positive multipart response를 제공하는지 어떤 운영 evidence로 기록하는가?
- 초기 key/certificate provision과 public certificate bundle evidence는 기록되었다. Kosmo repository secret 등록·Vault 동기화와 새 runtime·Store binary rotation evidence, publisher/device 결과를 어디에 보존할지는 PROD-335/336 runbook에서 확정한다.
- PROD-886/PROD-876 seed binary의 OTA consumer channel을 `prod`로 고정하고 release metadata를 어떤 binary workflow evidence로 기록하는가?
- failure/recovery evidence의 보존 위치와 PROD-336의 archive 승인자는 무엇인가? recovery evidence는 promotion/recovery 범위를 재개할 때 확정한다.
