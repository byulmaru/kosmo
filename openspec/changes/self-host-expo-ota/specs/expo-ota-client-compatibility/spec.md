## ADDED Requirements

### Requirement: OTA client selects a trusted project and channel tuple

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-333`; 적용되는 `docs/domain`·`docs/design` canonical 행동 문서 없음. Android·iOS release binary는 static update service URL에서 논리 project `kosmo-native`, binary platform(`ios` 또는 `android`), OTA channel(`staging` 또는 `production`), 그리고 binary의 `runtimeVersion`을 함께 사용하는 fixed tuple을 조회해야 한다(MUST). `runtimeVersion`만으로 project를 식별하거나 OTA channel을 Native public-config channel로 해석해서는 안 된다(MUST NOT). 두 OTA channel은 release binary에 내장된 Native public-config `prod`를 사용해야 한다(MUST).

#### Scenario: Select the staging route for an Android binary

- **WHEN** `kosmo-native` Android binary with a known `runtimeVersion` requests the `staging` OTA channel
- **THEN** the client requests the static manifest for the trusted Android project/channel/runtime tuple
- **AND** the binary keeps Native public-config `prod` independently of the OTA channel

#### Scenario: Reject runtime-only project selection

- **WHEN** an update response can be selected using only `runtimeVersion` without the trusted `kosmo-native` project and platform context
- **THEN** the client does not select that response
- **AND** the client continues with its embedded update

### Requirement: OTA client applies only a compatible signed update

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-333`; Expo Updates runtime-version/code-signing behavior is cited by the Linear contract, while the exact implementation remains owned by PROD-333. The client MUST accept an update only when its project/platform/channel context and `runtimeVersion` match the requesting release binary, its `multipart/mixed` manifest JSON part signature verifies against the trusted public certificate bundled in that binary, and every referenced asset satisfies the manifest hash. The OTA payload MUST be limited to JavaScript and asset changes.

#### Scenario: Apply a compatible verified update

- **WHEN** the service returns an update with matching project, platform, channel, and runtimeVersion
- **AND** the manifest JSON part signature and all asset hashes verify against the bundled public certificate
- **THEN** the client installs and launches the update

#### Scenario: Reject a mismatched runtime or signature

- **WHEN** the returned update has a different runtimeVersion, project/platform/channel context, invalid signature, or asset hash mismatch
- **THEN** the client does not install or launch the update
- **AND** the client uses the last valid or embedded update according to the local recovery rule

### Requirement: OTA failure preserves an executable fallback

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-336`; completed seed binary paths are `PROD-886` for Google Play Alpha and `PROD-876` for TestFlight. The client MUST preserve a last known-good or embedded update when update discovery, download, verification, or launch fails. An offline device MUST remain able to launch the preserved executable update, and recovery verification MUST demonstrate that a known-good update can be reissued without changing the native binary.

#### Scenario: Launch while offline

- **WHEN** a device cannot reach the update service during startup
- **THEN** the client launches the last known-good or embedded update
- **AND** it does not treat the unavailable network as a reason to apply unverified content

#### Scenario: Recover from a failed update

- **WHEN** a staged or promoted update fails verification or launch
- **THEN** the client remains on a valid fallback
- **AND** a subsequently reissued known-good signed update can be selected by the same compatibility rules
