## Context

이 change는 [proposal.md](./proposal.md)의 자체 호스팅 Expo OTA 결과를 `PROD-333`~`PROD-336`이 나눠 구현하기 위한 설계 handoff다. 현재 `apps/app/app.config.ts`는 Android package와 iOS bundle identifier, Expo Router 및 SecureStore plugin을 정의하지만 `expo-updates` bootstrap·runtimeVersion·code signing 설정은 아직 계약에 맞게 연결되어 있지 않다. `apps/app/src/config/public.ts`의 Native `dev`/`prod` 공개 설정은 OTA `staging`/`production`과 별도 축으로 유지해야 한다. 현재 Android 배포 workflow는 Google Play Alpha AAB를, iOS workflow는 TestFlight IPA를 각각 생성하므로, 새 OTA-enabled seed binary의 동일한 경로와 증적을 보존해야 한다.

Delivery는 기존 Temporal `apps/worker`의 책임을 확장하지 않고 조직 공용 정적 Cloudflare R2 경계로 분리한다. 정적 R2 endpoint와 multipart publisher Action/reusable workflow는 public `byulmaru/expo-ota` repository가 소유하고, Kosmo는 client와 승인된 export 및 publish 호출/promotion orchestration을 소유한다. Client, delivery, release pipeline은 동일한 `kosmo-native`·platform·OTA channel·runtimeVersion 계약을 공유하지만 각 구현 이슈가 자기 slice의 테스트와 결과를 소유한다.

## Goals / Non-Goals

**Goals:**

- Expo client가 trusted namespace와 runtimeVersion을 사용해 호환되는 signed update만 선택하도록 한다.
- 정적 Cloudflare R2가 namespace-aware read-only delivery와 multipart manifest 및 immutable asset을 제공하도록 한다.
- signed release를 staging에서 검증하고 production으로 promotion하며, known-good reissue recovery와 rotation 경계를 재현 가능하게 한다.
- PROD-886 Google Play Alpha와 PROD-876 TestFlight에서 새 OTA-enabled seed binary의 실기기 update·rejection·offline fallback·recovery 결과를 연결한다.

**Non-Goals:**

- EAS Update, percentage/user targeting, admin UI, public store release 자동화 또는 native code/SDK의 OTA 전달
- 기존 `apps/worker` Temporal workflow를 OTA delivery로 변환
- Kosmo repository에 조직 공용 정적 R2 source 또는 deploy config를 추가
- OTA channel을 Native public-config `dev`/`prod`로 재정의
- 실제 host/bucket provisioning, Vault secret 생성과 publish 실행 자체. 현재 handoff의 public base URL `https://expo-ota.byulmaru.co`와 R2 bucket `expo-ota`를 사용하고, 설정 및 live response는 운영 evidence로 확인한다.

## Implementation Guidance

### Current Constraints

- `apps/app`은 Expo SDK 56이며 package manifest에 `expo-updates`가 직접 선언되어 있지 않다. SDK가 요구하는 패키지 버전과 prebuild 결과를 PROD-333이 확인해야 한다.
- `app.config.ts`에 build identity와 plugin 목록이 있으므로 runtimeVersion, 고정 tuple update URL, code-signing 설정은 이 설정과 native prebuild 결과가 일치하도록 연결해야 한다. `runtimeVersion`만으로 project를 선택하면 안 된다.
- `public.ts`는 Native 개발에서 `dev`, release에서 `prod`를 선택한다. 이 선택을 OTA channel flag로 재사용하면 staging OTA가 잘못된 공개 API origin을 사용할 수 있다.
- Android workflow는 completed PROD-886 Google Play Alpha 경로이고 iOS workflow는 completed PROD-876 TestFlight 경로다. OTA-enabled binary를 만들 때 signing과 seed artifact evidence를 잃지 않아야 한다.
- 기존 `apps/worker`와 `apps/helm/templates/worker.yaml`은 Temporal Worker runtime이다. 여기에 OTA manifest/asset route를 임의로 추가하면 delivery와 workflow의 보안 경계가 섞인다.
- 정적 R2 manifest는 `multipart/mixed` 응답이며 첫 JSON part의 정확한 바이트에 `expo-signature`를 붙인다. publisher는 bundle과 asset을 SHA-256 content-addressed object로 먼저 업로드하고 read-back 검증한 뒤 tuple의 `manifest.json` object를 쓴다. manifest는 `private, no-store`, asset은 `public, max-age=31536000, immutable`이며 static host는 multipart bytes와 Expo protocol headers를 변형하지 않아야 한다.
- 정적 endpoint는 요청별 negotiation이나 signing을 하지 않는다. 서명·asset hash 검증은 public certificate를 포함한 client가 update 적용 전에 수행한다.
- publisher job은 signing private key를 Vault에서 읽어 사용하고, native seed binary에는 public certificate를 포함한다. `2026-09` 초기 private key는 Vault KV v2 `secret/data/expo-ota/signing/kosmo-native/2026-09`의 `private_key` field, version 1로 등록되었다. certificate validity는 `2026-09-10`부터 `2027-09-10`까지(KST)이며 첫 rotation은 `2027-03-10`에 예정되어 있다. 초기 provision과 public certificate source evidence는 기록되었고 publisher read·rotation·seed binary·device evidence는 남은 검증으로 관리한다.
- 조직 공용 정적 R2 source와 publisher workflow는 public `byulmaru/expo-ota`에서 관리한다. Kosmo에서는 delivery runtime을 복제하지 않고 client와 approved export/publish handoff만 연결한다.

### Recommended Approach

1. PROD-333이 client bootstrap을 먼저 `expo-updates`가 지원하는 native config와 앱 초기화 경계에 연결한다. 요청에 project/platform/channel/runtime tuple을 제공하고, public-config `prod` 선택은 별도로 보존한다.
2. manifest의 `expo-signature`와 asset hash 검증은 public certificate를 신뢰하는 client의 update 적용 직전 경계로 모으고, 오류는 last-known-good 또는 embedded update로 되돌린다. native requirement가 있는 변경은 release pipeline에서 새 store binary 경로로 보낸다.
3. PROD-334가 public `byulmaru/expo-ota` repository에서 조직 공용 정적 R2 delivery와 multipart publisher Action을 유지한다. asset은 content-addressed immutable object로 업로드하고 모두 검증한 뒤 fixed tuple manifest object를 갱신한다. 정적 endpoint는 이미 서명된 bytes만 제공하며 signing이나 요청별 release 선택을 하지 않는다.
4. Kosmo의 PROD-335가 승인된 app export를 publish workflow에 전달하고, protected production approval 뒤 Vault private key로 서명·publish한다. staging에서 multipart manifest와 모든 asset을 검증한 뒤 같은 승인 export bytes와 그 provenance를 사용해 production channel 전용 immutable asset object를 별도로 업로드하고 read-back·hash 검증한 뒤 새 production-channel signed manifest/release record로 promote한다. destination channel은 별도 object identity와 새 manifest/release record를 가지며, recovery는 새 release metadata를 가진 검증된 known-good multipart manifest로 reissue하고 asset bytes를 in-place로 고쳐 쓰지 않는다.
5. PROD-333이 PROD-886/PROD-876 경로용 OTA-enabled seed binary를 생성할 수 있도록 build metadata와 workflow handoff를 정리하고, PROD-336이 두 실제 기기에서 update, rejection, offline fallback, recovery를 증명한다.
6. PROD-336은 각 slice의 결과를 canonical tuple, release identity, test binary, device, failure output과 함께 묶어 cross-slice consistency를 확인한 뒤 shared OpenSpec을 archive한다. PROD-331은 그 archive와 하위 결과가 모두 연결된 뒤 parent 완료를 판단한다.

### Allowed Alternatives

- Expo 공식 config plugin 또는 package가 제공하는 동등한 bootstrap hook을 사용할 수 있다. 단, 결과가 동일한 runtime/project/channel 선택, code-signing 검증, fallback을 증명해야 한다.
- 현재 static R2 public base URL은 `https://expo-ota.byulmaru.co`, bucket은 `expo-ota`다. 설정된 host가 fixed tuple path, multipart response, immutable assets와 complete-release 계약을 보존하는지 운영 evidence로 확인한다.
- CI release runner나 별도 release service가 publish/promote를 수행할 수 있다. 단, signing private key는 Vault에서 publisher job 실행 중에만 사용하고 client·static R2 runtime에 두지 않으며, protected production approval과 immutable complete-release 계약을 보존해야 한다.

### Known Traps

- OTA `staging`을 Native public-config `dev`와 같은 값으로 취급하면 staging client가 dev API origin을 가리킬 수 있다.
- runtimeVersion만 비교하거나 project/platform/channel을 생략하면 서로 다른 binary가 잘못된 JavaScript/native API 조합을 받을 수 있다.
- manifest object를 먼저 바꾸거나 이미 공개한 asset을 덮어쓰면 partial release와 client별 다른 bytes가 발생한다.
- static R2 origin에 signing private key, Play/TestFlight credential 또는 publish token을 넣거나 Kosmo repository에 static R2 source를 복제하면 read-only delivery와 repository 경계가 깨진다.
- certificate rotation은 새 public certificate를 포함한 새 runtime과 새 Store binary를 배포하는 경계다. 구 runtime은 구 certificate를 계속 사용하며, 기존 binary에 새 certificate를 주입하거나 dual trust를 추가하지 않는다.
- Firebase App Distribution 또는 과거 PROD-285 Internal 경로를 현재 Android seed binary evidence로 재사용하면 current path인 PROD-886과 검증 결과가 불일치한다.
- PROD-287의 store-native automation을 OTA 전용 device verification의 blocker로 취급하면 독립적으로 완료 가능한 PROD-336 결과를 막게 된다.

## Risks / Trade-offs

- [Risk] static endpoint는 routing/header 설정만 확인되었고 positive manifest·asset·device 적용 evidence가 아직 없다. → 현재 handoff의 `https://expo-ota.byulmaru.co`와 `expo-ota`를 사용하고, PROD-334/336에서 live response와 device 결과를 별도 evidence로 기록한다.
- [Risk] SDK 56의 `expo-updates` native prebuild가 현재 config와 충돌할 수 있다. → PROD-333이 generated native project, local build, seed binary 설치 결과를 검증한다.
- [Risk] 1년 certificate를 6개월마다 교체하면 구 runtime과 새 runtime의 신뢰 material이 달라진다. → 새 certificate를 포함한 새 runtime·Store binary를 배포하고, 구 runtime은 구 certificate를 유지하는 rotation evidence를 기록한다.
- [Risk] offline/failure fallback은 CI만으로는 증명하기 어렵다. → PROD-336이 네트워크 차단과 invalid release를 포함한 실기기 evidence를 소유한다.

## Migration Plan

1. OpenSpec Gate에서 현재 tuple, static `byulmaru/expo-ota` delivery와 Kosmo client/release 경계, current endpoint/bucket handoff와 evidence boundary를 승인한다.
2. PROD-333과 PROD-334를 병렬 구현하고 각자의 focused verification을 연결한다.
3. 두 slice가 완료된 뒤 PROD-335가 Vault private key를 사용하는 signed multipart publish, staging validation, protected production promotion, recovery를 end-to-end로 검증한다.
4. PROD-333이 생성한 새 OTA-enabled Android/iOS seed binary를 각각 PROD-886 Google Play Alpha와 PROD-876 TestFlight로 배포한다.
5. PROD-336이 실제 기기 검증과 운영 runbook, cross-slice consistency를 완료하고 OpenSpec을 archive한다.
6. 실패 시 production fixed tuple manifest object를 부분 release로 변경하지 않고, 마지막 complete release 또는 embedded update로 돌아간다. native 변경이 필요한 경우 OTA rollback 대신 새 store binary를 만든다.

## Open Questions

- current static R2 endpoint `https://expo-ota.byulmaru.co`와 bucket `expo-ota`가 configured host/object와 일치하고 positive multipart response를 제공하는지 어떤 운영 evidence로 기록하는가?
- 초기 key/certificate provision과 public certificate bundle evidence는 기록되었다. 새 runtime·Store binary rotation evidence와 publisher/device 결과를 어디에 보존할지는 PROD-335/336 runbook에서 확정한다.
- PROD-886/PROD-876 seed binary의 OTA channel 선택과 release metadata를 어떤 authorized workflow input으로 고정하는가?
- failure/recovery evidence의 보존 위치와 PROD-336의 archive 승인자는 무엇인가?
