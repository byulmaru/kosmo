## ADDED Requirements

### Requirement: OTA client selects a trusted project and channel tuple

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-333`; 적용되는 `docs/domain`·`docs/design` canonical 행동 문서 없음. Android·iOS release binary는 approved handoff가 제공한 논리 project `kosmo-native`, binary platform(`ios` 또는 `android`), OTA channel path segment, 그리고 binary의 명시적 수동 호환성 세대인 `runtimeVersion`(초기값 문자열 `"0.2"`)을 함께 사용하는 fixed tuple을 조회해야 한다(MUST). Channel path safety는 release/delivery contract에서 보장하며 client bootstrap은 이를 위한 별도 native prebuild 검증을 추가하지 않는다. `runtimeVersion`만으로 project를 식별하거나 OTA channel을 Native public-config channel로 해석해서는 안 된다(MUST NOT). Deploy workflow는 논리적으로 `dev`/`prod` mapping을 사용하며 Store release binary는 OTA consumer channel `prod`와 Native public-config `prod`를 사용해야 한다(MUST). Channel 이름 자체는 이 목록으로 제한하지 않는다.

#### Scenario: Select the prod route for a Store Android binary

- **WHEN** `kosmo-native` Android Store binary with a known `runtimeVersion` requests the fixed `prod` OTA channel
- **THEN** the client requests the static manifest for the trusted Android project/channel/runtime tuple
- **AND** the binary keeps Native public-config `prod` independently of the OTA channel

#### Scenario: Reject runtime-only project selection

- **WHEN** an update response can be selected using only `runtimeVersion` without the trusted `kosmo-native` project and platform context
- **THEN** the client does not select that response
- **AND** the client continues with its embedded update

### Requirement: Runtime compatibility generation is manually managed

**Authority / Provenance:** explicit current user instruction for `PROD-336` / `self-host-expo-ota`. The client and release pipeline MUST use an explicitly assigned manual compatibility generation in `runtimeVersion`, initially the string `"0.2"`. Whenever native compatibility changes, the generation MUST be incremented and a new Android/iOS native binary MUST be produced before publishing an OTA for that generation. JS/assets-only OTA changes MUST keep the existing generation. An incompatible OTA MUST NOT be published without a new native binary and new runtime generation. `EXPO_UPDATES_FINGERPRINT_OVERRIDE` MUST NOT be used.

#### Scenario: Keep JS/assets-only OTA on the current generation

- **WHEN** a release changes only JavaScript or assets and remains compatible with the installed native binary
- **THEN** the release uses the existing runtime generation, initially `"0.2"`
- **AND** no new native binary or runtime generation is required

#### Scenario: Increment the generation for native compatibility changes

- **WHEN** a release changes native code, a native module, an SDK, or other native compatibility input
- **THEN** the runtime generation is incremented and a new Android/iOS native binary is produced
- **AND** the release is not published as an OTA for the previous generation

#### Scenario: Hold an incompatible OTA until a new binary exists

- **WHEN** an OTA requires a native compatibility change but no new native binary and incremented runtime generation are available
- **THEN** the release is not published
- **AND** the existing binary continues to use its current compatible generation

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

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-336`; completed seed binary paths are `PROD-886` for Google Play Alpha and `PROD-876` for TestFlight. The client MUST preserve a last known-good or embedded update when update discovery, download, verification, or launch fails. An offline device MUST remain able to launch the preserved executable update. Recovery reissue is deferred from the current implementation.

#### Scenario: Launch while offline

- **WHEN** a device cannot reach the update service during startup
- **THEN** the client launches the last known-good or embedded update
- **AND** it does not treat the unavailable network as a reason to apply unverified content

## Deferred Long-Term Contract

Known-good recovery reissue remains a long-term contract: a failed update must leave the client on a valid fallback, and a later verified release may be selected under the same compatibility rules without a native binary change. Recovery implementation and device evidence are held outside the current active requirements.
