# Expo OTA 운영

`kosmo-native`의 Expo OTA는 Docker 배포가 성공한 뒤 같은 source SHA를 사용해
Android와 iOS 업데이트를 export하고 publisher reusable workflow에 전달한다. Native module,
SDK, entitlement, permission 또는 그 밖의 native 설정이 바뀐 release는 OTA가 아니라 새
Store binary 경로를 사용한다.

## 책임과 release tuple

Kosmo는 승인된 source checkout, Expo CLI export와 artifact handoff를 소유한다.
`byulmaru/expo-ota` reusable workflow는 artifact를 내려 받아 R2 credential을 읽고 caller가
제공한 `signing_private_key`를 사용해 static `multipart/mixed` manifest와 immutable asset을
발행한다. Publisher는 signing key의 저장 경로나 provider를 결정하지 않는다. Client와 static
delivery에는 private key나 publish credential을 넣지 않는다.

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
Deploy Dev에 `dev`, Production Release에 `prod`를 전달한다. Publisher와 delivery의 fixed
path는 다음 형태다.

```text
releases/{project}/{platform}/{channel}/{runtimeVersion}/manifest.json
releases/{project}/{platform}/{channel}/{runtimeVersion}/assets/{sha256-hex}
```

Manifest는 Expo protocol headers를 포함한 `multipart/mixed` 응답으로 제공하고
`private, no-store`로 캐시한다. Asset은 SHA-256 hex 이름의 immutable object이며
`public, max-age=31536000, immutable`로 캐시한다.

## 자동 release 경로

정상 OTA publish는 두 배포 caller가 성공한 뒤 자동으로 시작한다.
`.github/workflows/deploy-dev.yml`과 `.github/workflows/production-release.yml`이
배포 성공 뒤 reusable workflow인 `.github/workflows/expo-ota.yml`을 호출한다. Android와
iOS publish job은 기존 job-level reusable workflow 호출을 유지한다. 두 caller는
Kosmo repository secret `EXPO_OTA_SIGNING_PRIVATE_KEY`를 local reusable workflow의
`signing_private_key`로 전달하고, local workflow는 이를 public publisher의 동일한 secret
이름으로 전달한다. Secret은 2026-09-10 10:06:24 UTC에 등록했다. 실제 publish 실행은 아직 검증하지 않았다.

| 호출 workflow      | 성공한 배포            | OTA channel | source SHA                       |
| ------------------ | ---------------------- | ----------- | -------------------------------- |
| Deploy Dev         | `kosmo-dev` Argo 배포  | `dev`       | `workflow_run.head_sha`          |
| Production Release | `kosmo-prod` Argo 배포 | `prod`      | `canonical_preflight.target_sha` |

Source는 caller가 선택하고 검증한 full 40-character SHA를 reusable workflow의 checkout
ref로 사용한다. reusable workflow가 최신 `main`을 다시 선택하거나 별도 SHA를 입력받지
않는다. Production Release의 기존 `prod` Environment 승인과 canonical Docker Build 확인이
OTA 호출에 선행한다. OTA에 별도의 두 번째 production approval을 두지 않는다.

Export job은 `pnpm exec expo-updates runtimeversion:resolve`로 Android와 iOS의
`runtimeVersion`을 각각 얻고, `pnpm exec expo export --clear`로 해당 platform artifact를
만든다. 각 artifact는 publisher reusable workflow에 전달된다. Publisher는 Expo Metro
`metadata.json`과 참조된 파일을 읽어 export를 검증하고, 실제 bundle과 asset bytes를
hashing한 뒤 signed immutable release를 R2에 기록하고 read-back한다.

Publisher의 prepublish read-back/hash 검증, manifest signing 또는 R2 write가 실패하면
해당 OTA workflow가 실패한다. 이 workflow는 별도의 provenance 파일을 만들거나 publish
후 public edge를 다시 조회하지 않는다. Static host가 실제로 응답하는지와 Store binary가
device에서 update, rejection, offline fallback을 수행하는지는 별도 운영 evidence로
확인한다.

## 사전 조건과 credential 경계

- 두 caller workflow는 `main`에서 source를 선택하고, Deploy Dev는 성공한 Docker Build의
  `workflow_run.head_sha`를 사용한다.
- Production Release는 기존 `canonical_preflight`가 확인한 SHA와 image digest를 사용한다.
- Publisher reusable workflow는 `EXPO_OTA_PUBLIC_BASE_URL`, `EXPO_OTA_R2_BUCKET`,
  `CLOUDFLARE_ACCOUNT_ID`와 R2 credential을 검증한다.
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
- publisher read-back/hash 결과와 publish job 결과
- production release의 Environment 승인과 동일한 source SHA

Android는 PROD-886 Google Play Alpha, iOS는 PROD-876 TestFlight seed path에서 Store binary와
device update/rejection/offline evidence를 별도로 검증한다.
