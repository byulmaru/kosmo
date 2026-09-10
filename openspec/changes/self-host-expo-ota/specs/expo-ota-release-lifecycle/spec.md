## ADDED Requirements

### Requirement: Deploy workflow publishes to its selected OTA channel

**Authority / Provenance:** explicit user scope correction recorded for `PROD-333` and `PROD-335`; `PROD-331`, `PROD-332`, `PROD-335`; 적용되는 `docs/domain`·`docs/design` canonical release 문서 없음. Deploy Dev MUST use the triggering Docker Build `workflow_run.head_sha` as its approved source and logically map that release to OTA channel `dev`. Deploy Production MUST use the canonical preflight approved target SHA, retain its existing `prod` Environment approval, and logically map that release to OTA channel `prod`. The client and publisher MUST accept any OTA channel that is a safe single path segment using only `[A-Za-z0-9._-]+`, except the exact values `.` and `..`; deploy mappings are not an allowlist. Native Store binary upload MUST remain a separate workflow and MUST NOT publish an OTA release.

#### Scenario: Publish a Deploy Dev source to the dev channel

- **WHEN** a successful Docker Build run triggers Deploy Dev
- **THEN** the OTA publisher receives that run's exact `workflow_run.head_sha` as the approved source
- **AND** the release is addressed to channel `dev`

#### Scenario: Publish an approved production source to the prod channel

- **WHEN** Deploy Production's preflight resolves an approved target SHA and the existing `prod` Environment approval is granted
- **THEN** the OTA publisher receives that exact target SHA as the approved source
- **AND** the release is addressed to channel `prod`

#### Scenario: Keep native Store upload separate

- **WHEN** native-store-distribution builds or uploads an Android or iOS Store binary
- **THEN** the workflow uses the fixed OTA consumer channel `prod` in the binary metadata
- **AND** the workflow does not publish an OTA release or expose a manual OTA channel selector

### Requirement: Release publication exposes only complete signed artifacts

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-334`, `PROD-335`; the publisher contract is owned by public `byulmaru/expo-ota`. Each deploy-selected release MUST use the same canonical project/platform/safe-channel-segment/runtime tuple, MUST sign the exact multipart manifest JSON part, and MUST verify every referenced asset before replacing the fixed tuple manifest object. An incomplete artifact, failed verification, or native code/module/SDK requirement MUST not be published as an applicable OTA update; native requirements go through a new Store binary.

#### Scenario: Publish a complete signed channel release

- **WHEN** the approved export, multipart manifest JSON part, signature, and every referenced asset pass verification
- **THEN** the publisher records a signed release under the selected safe channel segment and tuple
- **AND** the fixed tuple manifest object refers only to that complete release

#### Scenario: Hold a failed release

- **WHEN** an artifact is incomplete or manifest, signature, asset, or compatibility verification fails
- **THEN** the publisher refuses to expose it as the fixed tuple release
- **AND** the currently serving complete release remains unchanged

#### Scenario: Route native requirements to Store distribution

- **WHEN** a release requires native code, a native module, or an SDK change
- **THEN** the release is excluded from OTA publication
- **AND** the change is sent through a new Android or iOS Store binary path

### Requirement: Rotation and operation evidence are bounded

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-335`, `PROD-336`. The release runbook MUST document the boundary between signing-key/credential rotation and normal channel publication. The signing certificate has one-year validity and is rotated every six months; each rotation uses a new certificate, runtime, and Store binary, while an existing runtime continues to use its existing bundled certificate. The signing private key remains stored in Vault and is also stored as the Kosmo repository secret `EXPO_OTA_SIGNING_PRIVATE_KEY`. Deploy Dev and Deploy Production MUST pass that repository secret to the local reusable workflow's required `signing_private_key` input, and the local workflow MUST forward the same input to the public publisher. The Vault value and Kosmo repository secret MUST be synchronized on rotation. The common publisher MUST be storage/provider-agnostic and MUST NOT choose or directly query a Vault path or field. The public `byulmaru/expo-ota` repository, static R2, client, job output, log, and artifact MUST NOT store the private key. The public certificate is bundled in each native seed binary. The initial `2026-09` private key is registered in Vault KV v2 at `secret/data/expo-ota/signing/kosmo-native/2026-09` under `private_key` (version 1) as caller operational evidence, and the public certificate source is `apps/app/certs/certificate.pem`; its recorded validity is 2026-09-10 through 2027-09-10 (KST), with the first rotation scheduled for 2027-03-10. Kosmo repository secret registration completed at 2026-09-10 10:06:24 UTC using the Vault version 1 key after matching its public key to the bundled certificate. Caller forwarding execution, seed binary, and rotation execution evidence remain pending, and dual trust is not part of this contract.

#### Scenario: Rotate trust material with an explicit transition

- **WHEN** signing trust material is rotated
- **THEN** the runbook records the new certificate, runtime, and Store binary for the rotation
- **AND** each existing runtime continues to use its existing certificate without dual trust
- **AND** a release is not published using an unrecorded or implicitly changed key

#### Scenario: Verify both seed binary paths on device

- **WHEN** a new OTA-enabled Android binary is distributed through completed PROD-886 Google Play Alpha and an iOS binary through completed PROD-876 TestFlight
- **THEN** PROD-336 installs each binary on a real device and verifies update, rejection, and offline fallback behavior
- **AND** the evidence identifies the platform, binary, runtimeVersion, OTA channel, and release identity used

#### Scenario: Keep store automation separate from OTA verification

- **WHEN** PROD-287's store-native automation or device flow is unavailable or changes
- **THEN** OTA-specific device verification remains owned by PROD-336 using PROD-886 and PROD-876
- **AND** PROD-287 is treated as related context rather than an OTA blocker

## Deferred Long-Term Contract

Release promotion and known-good recovery reissue remain held outside the current active requirements. The long-term contract preserves the same approved export and verified asset provenance across any future channel promotion, uses a new signed release metadata record for recovery, keeps content-addressed asset bytes immutable, and changes the fixed tuple manifest only after complete verification. No promotion or recovery implementation, evidence, or separate issue is required for this change; the scope may be reopened when the external publisher's generic safe channel segment contract and an operating owner are ready.
