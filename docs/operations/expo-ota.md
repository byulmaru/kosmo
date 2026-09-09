# Expo OTA 운영

이 문서는 `kosmo-native` Expo OTA release workflow의 staging, production promotion과
recovery 절차를 정의한다. OTA는 현재 native binary와 호환되는 JavaScript와 asset만 전달한다.
native module, SDK, entitlement, permission 또는 그 밖의 native 설정이 바뀐 release는 새
Store binary 경로를 사용한다.

## 책임과 release tuple

Kosmo는 승인된 Expo export, provenance, workflow 입력 검증과 promotion/recovery orchestration을
소유한다. `byulmaru/expo-ota`는 서명 private key를 사용하는 publisher와 static R2 read-only
delivery를 소유한다. Client와 static delivery에는 private key나 publish credential을 넣지 않는다.

모든 release는 다음 tuple로 식별한다.

| 항목           | 값                              |
| -------------- | ------------------------------- |
| project        | `kosmo-native`                  |
| platform       | `android` 또는 `ios`            |
| OTA channel    | `staging` 또는 `production`     |
| runtimeVersion | Expo fingerprint lowercase hash |
| keyid          | 등록된 signing key identifier   |

OTA channel은 Native public-config의 `dev`/`prod`와 별개다. Store release binary는
public-config `prod`를 사용하고, staging 검증은 OTA channel만 `staging`으로 지정한다.
Publisher와 delivery의 fixed path는 다음 형태를 사용한다.

```text
releases/{project}/{platform}/{channel}/{runtimeVersion}/manifest.json
releases/{project}/{platform}/{channel}/{runtimeVersion}/assets/{sha256-hex}
```

Manifest는 `multipart/mixed`와 Expo protocol headers를 그대로 제공하고 `private, no-store`로
캐시한다. Asset은 SHA-256 hex로 이름을 정한 immutable object이며
`public, max-age=31536000, immutable`로 캐시한다.

## 사전 조건

- Workflow를 저장한 `main` ref에서 실행한다.
- `EXPO_OTA_PUBLIC_BASE_URL`, `EXPO_OTA_R2_BUCKET`, `CLOUDFLARE_ACCOUNT_ID` repository
  variables가 설정되어 있다.
- `keyid`에 대응하는 private key는 publisher job이 Vault에서 읽는다. Kosmo workflow 입력이나
  artifact에 private key를 넣지 않는다.
- production 작업은 GitHub `prod` Environment required reviewer 승인을 통과해야 한다.
- promotion과 recovery는 이전 workflow run의 검증 artifact와 positive workflow run ID를 사용한다.

## Release 또는 staging

`release`는 승인된 source SHA를 export하고 staging에 publish한 뒤 manifest와 모든 asset을
검증한다. staging 검증 artifact에는 export bytes와 `provenance.json`이 보존된다. staging 검증이
성공해야 `release`가 production approval 경계로 진행한다.

`stage`는 같은 export와 staging 검증까지만 수행한다. production fixed tuple을 변경하지 않으며,
나중에 `promote`에서 해당 staging 검증 artifact를 source로 사용한다.

Workflow dispatch 입력은 다음과 같다.

```text
operation=release|stage
platform=android|ios
source_sha=<main에 존재하는 40자리 approved commit SHA>
keyid=<등록된 keyid>
```

`source_sha`와 checkout된 `HEAD`가 다르면 export를 중단한다. Export helper는 metadata의
선택된 platform bundle과 asset을 다시 읽어 SHA-256 inventory를 만들고, `provenance.json`에
source SHA, runtimeVersion, metadata hash와 file hash를 기록한다.

## Production promotion

staging 검증 artifact의 bytes와 provenance를 사용해 `promote`를 실행한다.

1. 이전 run의 staging verified artifact를 다운로드한다.
2. local metadata, file inventory, source keyid와 staging manifest/asset 검증 evidence를 확인한다.
3. 현재 staging tuple을 다시 검증해 source bytes와 일치하는지 확인한다.
4. `prod` Environment 승인이 끝난 뒤에만 production publish를 실행한다.
5. publisher가 production channel의 asset object를 별도 identity로 업로드하고 각 object를
   read-back/hash 검증한 뒤 새 production manifest를 서명·발행한다.
6. caller가 발행된 production manifest와 모든 asset을 다시 검증하고, staging source manifest ID를
   `--source-manifest-id`로 받아 같은 manifest ID를 거부한다.

Publisher의 prepublish asset read-back/hash 검증 또는 manifest 생성·발행이 실패하면 complete-release
gate가 production fixed tuple을 바꾸지 않고 기존 release를 유지한다. Caller의 post-publish
manifest/asset 검증 또는 새 manifest ID 검사가 실패하면 publisher가 fixed tuple을 이미 바꿨을 수
있으므로 기존 release가 유지됐다고 자동으로 주장하지 않는다. 관찰된 manifest 상태와 publisher
결과를 기록하고 completion을 보류한 뒤 recovery 여부를 판단한다. 어느 단계에서도 staging asset
object를 덮어쓰지 않는다.

```text
operation=promote
platform=android|ios
source_run_id=<staging 검증이 성공한 workflow run ID>
source_artifact_name=<기본값: expo-ota-{platform}-{run_id}-verified>
source_channel=staging
keyid=<등록된 keyid>
```

## Production recovery

Recovery는 현재 production fixed tuple을 source로 다시 조회하지 않는다. 이전 production
검증 run이 업로드한 `production-verified` artifact 안의 `provenance.json`에 있는 known-good
manifest ID, URL, multipart hash, asset count와 `verified` 상태를 사용한다. Helper는 local
export bytes와 file inventory를 다시 검증하고 preserved manifest URL이 같은 project/platform/
production/runtime tuple인지, asset count가 일치하는지 확인한 뒤 recovery promotion record를
만든다.

따라서 현재 production manifest가 invalid, incomplete 또는 일시적으로 접근 불가해도 보존된
known-good evidence와 export bytes가 완전하면 recovery를 준비할 수 있다. Evidence가 없거나
local bytes가 바뀌었거나 asset count가 일치하지 않으면 publish하지 않는다. Publisher는 기존
asset을 in-place로 수정하지 않고 새 production manifest/release metadata를 발행한다.

```text
operation=recover
platform=android|ios
source_run_id=<production 검증이 성공한 workflow run ID>
source_artifact_name=<기본값: expo-ota-{platform}-{run_id}-production-verified>
source_channel=production
keyid=<등록된 keyid>
```

`promotion.json`에는 operation, tuple, source SHA, source manifest identity와 source file
inventory를 기록한다. 이 record와 `provenance.json`을 production publish artifact와 함께
보존한다.

## 실패와 재개 조건

### Publish 전에 중단

다음 조건에서는 production publish를 시작하지 않는다.

- source SHA, run ID, platform, channel 또는 keyid 입력이 유효하지 않다.
- export metadata가 없거나 선택된 bundle/asset path가 export directory 밖을 가리킨다.
- provenance와 현재 metadata/file bytes가 다르다.
- staging manifest의 signature, runtimeVersion, project tuple 또는 asset hash 검증이 실패한다.
- recovery artifact에 preserved production verification evidence가 없거나 tuple/asset count가
  맞지 않는다.

Publisher prepublish gate가 실패한 경우 기존 production fixed tuple이 유지되는지 publisher 결과로
확인하고, 실패 원인을 수정한 뒤 검증이 다시 끝난 새로운 workflow run을 source로 선택한다. 남은
immutable asset object를 기존 object의 대체물로 취급하지 않는다.

### Publish 후 검증 실패

다음 조건은 publisher가 production manifest를 발행한 뒤 caller 검증에서 발견될 수 있다.

- production manifest의 signature, runtimeVersion, project tuple 또는 asset hash 검증이 실패한다.
- production manifest ID가 staging/source manifest ID와 같다.

이 경우 production fixed tuple이 어느 manifest를 가리키는지와 publisher의 실제 완료 결과를 먼저
확인한다. 기존 complete release가 유지됐다고 추정하지 않으며, 자동으로 object를 삭제하거나
덮어쓰지 않는다. 필요한 경우 이전 production verified artifact를 source로 `recover`를 실행하고,
새 production manifest ID와 post-publish 검증 결과를 별도 evidence로 남긴다.

## Signing key와 certificate rotation

현재 key registration은 Vault KV v2
`secret/data/expo-ota/signing/kosmo-native/2026-09`의 `private_key` version 1이다. Public
certificate source는 [`apps/app/certs/certificate.pem`](../../apps/app/certs/certificate.pem)이며,
기록된 certificate validity는 2026-09-10부터 2027-09-10까지(KST)다. 첫 rotation 예정일은
2027-03-10이다.

Rotation은 새 certificate, 새 runtimeVersion과 새 Android/iOS Store binary를 함께 기록하는
명시적 전환이다. 새 keyid를 publisher에 등록하고 public certificate를 새 binary에 bundle한
뒤 새 runtime의 staging 검증과 device evidence를 완료한다. 기존 runtime은 기존 bundled
certificate를 계속 사용하며 기존 binary에 새 certificate를 주입하거나 dual trust를 추가하지
않는다. Rotation 전후 release에는 실제 Vault read, publisher result, binary identity와 device
결과를 각각 보존한다.

현재 workflow verifier는 `main`의 `apps/app/certs/certificate.pem` 단일 certificate만 사용하므로,
rotation 뒤 old `keyid`/runtime의 promotion과 발행 후 검증이 자동으로 보장되지 않는다. Recovery
준비는 preserved evidence로 수행할 수 있지만, old certificate로 서명된 결과의 post-publish 검증도
같은 제한을 가진다. 첫 rotation 전에 old runtime 지원을 종료할지 해당 old certificate를 검증하는
경로를 추가할지 결정해야 하며, 초기 `2026-09` 범위에는 다중 certificate 지원을 추가하지 않는다.
현재 문서의 “구 runtime은 구 certificate를 유지한다”는 표현은 binary 동작에만 해당하고 workflow
verifier 지원까지 의미하지 않는다.

## Evidence checklist

Release 완료를 기록할 때 다음 값을 workflow summary와 artifact에서 교차 확인한다.

- workflow run ID, `main` workflow definition ref와 approved source SHA
- project, platform, OTA channel, runtimeVersion과 keyid
- export file inventory와 metadata SHA-256
- staging/production manifest ID, URL, multipart SHA-256과 asset count
- `promotion.json`의 operation과 source manifest identity
- production approval과 publisher read-back/hash 결과
- failure 또는 recovery인 경우 기존 complete release 유지 여부와 resume condition

Local helper test와 workflow syntax 검증은 실제 R2 publication, Vault read, Store binary 설치,
device update/rejection/offline/recovery evidence를 대신하지 않는다. Android는 PROD-886 Google
Play Alpha, iOS는 PROD-876 TestFlight seed path에서 별도로 검증한다.
