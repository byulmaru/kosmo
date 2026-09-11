# Expo OTA 운영

`kosmo-native`의 Expo OTA는 Docker Build가 성공한 같은 source SHA를 사용해 Android와 iOS
업데이트를 export하고 publisher reusable workflow에 전달한다. Deploy Dev에서는 두
platform export가 Argo 배포와 병렬로 시작하고, 각 publish는 Argo 배포와 자신의 export가
성공한 뒤 시작한다. Native module, SDK, entitlement, permission 또는 그 밖의 native
설정이 바뀐 release는 OTA가 아니라 새 Store binary 경로를 사용한다.

Native Store binary의 기본 OTA channel은 `prod`다. 인증 후 Native Settings의 `정보`와
인증 전 복구 진입점에서 `dev` 또는 `prod`를 선택할 수 있으며, 이 선택은 API origin·OIDC 로그인
환경과 OTA channel을 함께 전환한다. Web의 channel 선택과 `/settings/info` public policy link는
이 runtime 전환의 대상이 아니다.

## 책임과 release tuple

Kosmo는 승인된 source checkout, Expo CLI export와 artifact handoff를 소유하고, local
`.github/workflows/expo-ota.yml` reusable workflow는 한 platform의 export와 artifact를
담당한다. `byulmaru/expo-ota` reusable workflow는 artifact를 내려 받아 R2 credential을 읽고
caller가 제공한 `signing_private_key`를 사용해 static `multipart/mixed` manifest와 immutable
asset을 발행한다. Publisher는 signing key의 저장 경로나 provider를 결정하지 않는다. Client와
static delivery에는 private key나 publish credential을 넣지 않는다.

모든 release는 다음 tuple로 식별한다.

| 항목           | 값                                       |
| -------------- | ---------------------------------------- |
| project        | `kosmo-native`                           |
| platform       | `android` 또는 `ios`                     |
| OTA channel    | caller가 선택한 안전한 단일 path segment |
| runtimeVersion | Expo fingerprint lowercase hash          |
| keyid          | 등록된 signing key identifier            |

채널은 비어 있지 않고 영문 대소문자, 숫자, `.`, `_`, `-`만 포함하는 단일 path segment여야
한다. `.`과 `..`은 사용할 수 없다. 현재 자동 caller는 Native public-config 의미에 맞춰
Deploy Dev에 `dev`, Production Release에 `prod`를 전달한다. Publisher와 delivery의 existing
tuple object path는 다음 형태를 유지한다.

```text
releases/{project}/{platform}/{channel}/{runtimeVersion}/manifest.json
releases/{project}/{platform}/{channel}/{runtimeVersion}/assets/{sha256-hex}
```

Manifest는 Expo protocol headers를 포함한 `multipart/mixed` 응답으로 제공하고
`private, no-store`로 캐시한다. Asset은 SHA-256 hex 이름의 immutable object이며
`public, max-age=31536000, immutable`로 캐시한다.

Native channel 조회는 기존 R2 custom-domain 경로를 유지한 채 Cloudflare URL Rewrite Rule로 제공한다.
Native client의 `updates.url`은 `https://expo-ota.byulmaru.co/releases/kosmo-native`로 고정하고,
`expo-platform`, `expo-runtime-version`, `expo-channel-name` request header를 보낸다. Expo protocol v1을
포함한 공용 Rule은 host의 `/releases/{project}` 단일 project path와 필수 header를 검사한 뒤 project path
segment를 보존하면서 URI path만 기존 `/releases/{project}/{platform}/{channel}/{runtimeVersion}/manifest.json`으로
내부 rewrite한다. Rule의 channel은 Native selector의 `dev`·`prod`에 한정하지 않고 publisher의 generic safe
channel contract를 유지한다.
R2 custom domain은 rewritten object에서 signed multipart bytes를 반환한다. Manifest 안의 asset URL은
기존 R2 asset object를 가리키며, `/releases/*` static manifest·asset과 publisher contract는 그대로
유지한다. 새 Worker endpoint나 별도 path는 만들지 않는다. 기존 `/releases/*/manifest.json` Cache Rule과
response-header transform은 rewrite target에도 적용되어야 하며, provider에서 live 확인한다.

검토용 Rule artifact는 [`expo-ota-url-rewrite.json`](./expo-ota-url-rewrite.json)이다. `PROD-334`에서
2026-09-11에 `expo_ota_manifest_header_route` Rule을 provider에 배포했고, active Rule ID는
`a8d13899b9884eeb9cc4088d22942701`이다. Rule은 `GET`과 `expo-ota.byulmaru.co`의
`/releases/{project}` 단일 safe project path, `expo-protocol-version: 1`, `expo-platform`의 `ios|android`,
generic safe `expo-channel-name`, `expo-runtime-version`을 검사하고, project를 보존한 기존 tuple의
`manifest.json`으로 URI path만 rewrite한다. 기존 Cache/Response Header Rule은 변경하지 않았다.

## Cloudflare URL Rewrite Rule live evidence

고정된 query 없는 Native manifest URL에 대해 Deploy Dev run `34583000701`에서 확인한 runtime tuple을
2026-09-11 09:24 UTC에 live edge에서 조회했다. 당시 iOS 응답은 runtimeVersion
`dc51d9bc8b4f2a18b2e23fd34bdecd14f165f24a`, update ID
`48a06c02-3038-4cbf-a8af-c541db9f52b0`, 10,242 bytes와 SHA-256
`69b5ca0abac75a768e82ddc55f8afed43dda701fa0277bfc3f0d5df467036a91`을 반환했다. Android는 runtimeVersion
`c653d26c07552d7a6a5d13718fad8308fa1791f7`, update ID
`0298ba7d-1974-45f8-a052-43870a432828`, 11,685 bytes와 SHA-256
`34e7a59c8abea6f795f37332eaf79d7f1746077c9f0f60ea6b9e0b1fb1058a6b`을 반환했다. 각 generic path 응답은
동일한 direct tuple manifest 응답과 body bytes, `multipart/mixed`, `cache-control: private, no-store`,
`expo-protocol-version: 1`, `expo-sfv-version: 0`, `ETag`를 유지했으며 `cf-cache-status: DYNAMIC`이었다.

두 manifest의 launch asset direct URL도 각각 200으로 응답했고, iOS 30,049,861 bytes
(`9d894307d4c3dc984e6c9e97302e17f4fd395921ecea00d7837406b2727b386e`)와 Android 30,352,556 bytes
(`a4925d4b991d34f311f93b16d67f54512f34cd8a575f6a3ae5b08618ffb080db`) 모두
`application/javascript`, `public, max-age=31536000, immutable`을 유지했다. 기존 direct tuple은 required
header 없이도 200이었고, missing protocol header, invalid platform `windows`, unsafe runtime
`../secret`, nested project path, normalized unsafe project path는 모두 404였다. 안전한 미존재 project
`example-project`와 channel `staging`도 404로 종료되어 synthetic response를 만들지 않았다.

이 change가 지원하고 검증한 manifest 요청은 query 없는 고정 Native URL이다. query를 붙인 probe는 body는
동일하게 200이었지만 기존 edge 동작에 따라 `expo-protocol-version`과 `expo-sfv-version`이 없어 지원
계약의 증거로 사용하지 않는다. Query 지원을 위해 기존 full-URI wildcard, Cache Rule 또는 response-header
transform을 변경하지 않는다.

## 자동 release 경로

Deploy Dev의 Docker Build가 성공하면 Android와 iOS export가 `update_dev` Argo 배포와
병렬로 시작한다. 각 publish는 `update_dev`와 자신의 platform export가 성공한 뒤 자동으로
시작한다. Production Release는 기존 `canonical_preflight`와 `production_deploy`가 성공한
뒤 Android와 iOS export 및 publish를 시작한다. 두 caller는 platform별로 local reusable
workflow인 `.github/workflows/expo-ota.yml`을 호출하고, 각 publish job은
`byulmaru/expo-ota` public reusable workflow를 직접 호출한다. Publish job은 Kosmo
repository secret `EXPO_OTA_SIGNING_PRIVATE_KEY`를 public publisher의 `signing_private_key`
로 전달한다. Secret은 2026-09-10 10:06:24 UTC에 등록했다. Deploy Dev run `34583000701`에서 확인한
Android와 iOS dev tuple을 위 live edge snapshot에서 조회했고, 당시 manifest와 launch asset을 확인했다.
Production `prod` publish 및 Native Store/device 적용은 별도 evidence로 남긴다.

| 호출 workflow      | 성공한 배포            | OTA channel | source SHA                       |
| ------------------ | ---------------------- | ----------- | -------------------------------- |
| Deploy Dev         | `kosmo-dev` Argo 배포  | `dev`       | `workflow_run.head_sha`          |
| Production Release | `kosmo-prod` Argo 배포 | `prod`      | `canonical_preflight.target_sha` |

Source는 caller가 선택하고 검증한 full 40-character SHA를 reusable workflow의 checkout
ref로 사용한다. reusable workflow가 최신 `main`을 다시 선택하거나 별도 SHA를 입력받지
않는다. Production Release의 기존 `prod` Environment 승인과 canonical Docker Build 확인이
OTA 호출에 선행한다. OTA에 별도의 두 번째 production approval을 두지 않는다.

Android와 iOS export job은 각각 `pnpm exec expo-updates runtimeversion:resolve`로 해당
platform의 `runtimeVersion`을 얻고, `pnpm exec expo export --clear`로 artifact를 만든다.
각 platform publish job은 자신의 export가 성공하고 caller의 배포 gate를 통과하면 해당
artifact와 runtimeVersion을 public publisher reusable workflow에 전달한다. Publisher는 Expo Metro
`metadata.json`과 참조된 파일을 읽어 export를 검증하고, 실제 bundle과 asset bytes를
hashing한 뒤 사전 계산한 SHA-256 표준 Base64를 각 R2 `PutObject`에 전달해 서버 검증을 수행하며 signed immutable release를 R2에 기록한다.

Publisher의 R2 upload SHA-256 서버 검증, manifest signing 또는 R2 write가 실패하면
해당 OTA workflow가 실패한다. 이 workflow는 별도의 provenance 파일을 만들거나 publish
후 public edge를 다시 조회하지 않는다. Static host가 실제로 응답하는지와 Store binary가
device에서 update, rejection, offline fallback을 수행하는지는 별도 운영 evidence로
확인한다.

## Native에서 channel 전환

Native channel selector는 공식 `expo-updates`의 persistent request-header override로
`expo-channel-name`을 설정한다. `Updates.channel`은 reload 뒤 앱이 시작한 현재 channel의 단일
source로 사용하며, OTA routing을 위해 별도의 client-local channel 값을 저장하지 않는다. 앞의
Cloudflare URL Rewrite Rule이 이 header와 기존 tuple manifest를 연결한다.

다른 channel을 확정하면 현재 binary의 platform·runtimeVersion과 호환되는 signed update를
확인하고 download한다. 두 단계가 모두 성공한 경우에만 현재 Native login을 삭제한 뒤
`Updates.reloadAsync()`를 호출한다. 취소와 현재 channel 재선택은 header, login, update와 reload를
바꾸지 않는다.

호환 update가 없거나 확인·download가 실패하면 시도한 header override를 되돌리고 기존 channel과
last-known-good 또는 embedded update를 유지한다. Rewrite target manifest가 없어 static origin이
404를 반환하는 경우도 같은 update 확인 실패로 처리한다. 다른 channel을 기본값으로 적용하거나
signature·asset hash 검증을 건너뛰지 않으며, static origin의 404를 custom response로 바꾸지 않는다.
이 복구 진입점은 인증 전 Native login 화면에서도 제공하며, Web에는 같은 selector를 만들지 않는다.

## 사전 조건과 credential 경계

- 두 caller workflow는 `main`에서 source를 선택하고, Deploy Dev는 성공한 Docker Build의
  `workflow_run.head_sha`를 사용한다.
- Production Release는 기존 `canonical_preflight`가 확인한 SHA와 image digest를 사용한다.
- Publisher reusable workflow는 `EXPO_OTA_PUBLIC_BASE_URL`, `EXPO_OTA_R2_BUCKET`,
  `CLOUDFLARE_ACCOUNT_ID`와 R2 credential을 검증한다.
- Native Store binary는 `https://expo-ota.byulmaru.co/releases/kosmo-native`를 update URL로
  빌드하고, 기본 channel `prod`의 `expo-channel-name` header를 포함한다. Settings selector는
  persistent override로 `dev` 또는 `prod`만 선택한다.
- reusable publisher는 GitHub OIDC로 Vault에서 R2 credential을 읽고, caller가 전달한
  `signing_private_key`를 publisher input으로 사용한다. Signing key와 R2 credential을
  export artifact, client bundle 또는 job output으로 운반하지 않는다.
- Signing private key는 Vault 원본과 Kosmo repository secret
  `EXPO_OTA_SIGNING_PRIVATE_KEY`에 함께 보관하며, 두 값은 rotation 때 동기화한다. Secret
  값의 등록과 실제 publisher 실행 결과는 별도 운영 evidence로 확인한다.
- `keyid`는 현재 기본값 `2026-09`이며 publisher에 등록된 identifier여야 한다.

## Signing key와 certificate rotation

현재 key registration은 Vault KV v2
`secret/data/expo-ota/signing/kosmo-native/2026-09`의 `private_key` version 1이다. Public
certificate source는 [`apps/app/certs/certificate.pem`](../../apps/app/certs/certificate.pem)이며,
기록된 certificate validity는 2026-09-10부터 2027-09-10까지(KST)다. 첫 rotation 예정일은
2027-03-10이다. 동일한 signing private key는 Kosmo repository secret
`EXPO_OTA_SIGNING_PRIVATE_KEY`에도 동기화해 deploy caller가 사용한다. 최초 등록은
2026-09-10 10:06:24 UTC에 완료했다. Vault version 1 키의 공개키와 bundled certificate의
일치를 확인한 뒤 GitHub에 전달했으며, 등록 결과는 secret 이름과 `updatedAt`으로 확인했다.
GitHub에 저장된 값의 재조회나 실제 OTA 발행 검증을 수행한 것은 아니다.

Rotation은 새 certificate, 새 runtimeVersion과 새 Android/iOS Store binary를 함께 기록하는
명시적 전환이다. Vault 값과 Kosmo repository secret을 함께 갱신하고, 새 keyid를 publisher에
등록하고 public certificate를 새 binary에 bundle한 뒤 새 runtime의 dev publish 결과와 device
evidence를 완료한다. 기존 runtime은
기존 bundled certificate를 계속 사용하며 기존 binary에 새 certificate를 주입하거나 dual
trust를 추가하지 않는다.

## Evidence checklist

자동 release 완료를 기록할 때 workflow 로그와 publisher 결과에서 다음 값을 확인한다.

- workflow run ID, caller workflow ref와 source SHA
- project, platform, OTA channel, runtimeVersion과 keyid
- publisher의 R2 upload SHA-256 검증 결과와 publish job 결과
- production release의 Environment 승인과 동일한 source SHA
- Native selector의 cancel·same-selection no-op, compatible update 전환과 no compatible/download
  failure 시 기존 channel·fallback 유지 결과

Android는 PROD-886 Google Play Alpha, iOS는 PROD-876 TestFlight seed path에서 Store binary와
device update/rejection/offline evidence를 별도로 검증한다.
