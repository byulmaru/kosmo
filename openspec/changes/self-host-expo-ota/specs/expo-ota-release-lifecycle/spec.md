## ADDED Requirements

### Requirement: Release lifecycle verifies before promotion

**Authority / Provenance:** explicit user-approved repository boundary; `PROD-331`, `PROD-332`, `PROD-335`; `PROD-333` owns client bootstrap and compatibility handoff. Kosmo owns the approved app export and publish/promotion orchestration, while public `byulmaru/expo-ota` owns the organization-shared static R2 endpoint and multipart publisher Action/reusable workflow. The release pipeline MUST create a signed immutable staging release, verify its multipart manifest and assets in the staging OTA channel, and promote the same approved export bytes and their verified asset provenance to the production OTA channel. Promotion MUST separately upload the verified production-channel asset bytes into destination channel object identities, verify each object by read-back and hash, and issue a newly signed production-channel multipart manifest/release record with its own production metadata; it MUST NOT create a second unverified asset set. Signing MUST use the Vault-held private key only during the publisher job, and production publication/promotion MUST retain its existing explicit approval gate. A release requiring native code, a native module, or an SDK change MUST be sent through a new store binary rather than this OTA lifecycle. Staging and production MUST use the same compatibility and signature contract.

#### Scenario: Promote a staged release

- **WHEN** a signed release is complete and passes staging manifest, asset, and compatibility verification
- **THEN** the pipeline uses the same approved export bytes and verified asset provenance to separately upload and read-back/hash-verify the production-channel asset objects
- **AND** the pipeline creates and signs a production-channel manifest/release record with production metadata
- **AND** the fixed tuple production manifest object refers to that newly signed production record

#### Scenario: Hold a failed staging release

- **WHEN** staging verification fails or an artifact is incomplete
- **THEN** the pipeline does not promote the release to production
- **AND** the current production release remains unchanged

### Requirement: Recovery reissues a known-good release

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-335`, `PROD-336`. The pipeline MUST provide a recovery operation that reissues a previously verified known-good update as a new normal signed multipart manifest/release record with fresh release metadata under the same project/platform/channel/runtime contract. Recovery MUST preserve immutable asset contents and MUST replace the fixed tuple manifest only with a complete verified record; it MUST NOT mutate an already-published asset or expose an incomplete current release.

#### Scenario: Recover production with a known-good update

- **WHEN** the current production release is found unsuitable after promotion
- **THEN** the operator reissues a previously verified known-good update
- **AND** compatible clients can select the newly identified and signed release without a native binary change

#### Scenario: Reject an unverified recovery target

- **WHEN** the requested recovery target lacks complete manifest, asset, or signature evidence
- **THEN** the pipeline refuses to publish or promote it
- **AND** the existing production release remains the current complete release

### Requirement: Rotation and operation evidence are bounded

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-335`, `PROD-336`. The release runbook MUST document the boundary between signing-key/credential rotation and normal release publication. The signing certificate has one-year validity and is rotated every six months; each rotation uses a new certificate, runtime, and Store binary, while an existing runtime continues to use its existing bundled certificate. The private key is read from Vault during the publisher job and the public certificate is bundled in each native seed binary. The initial `2026-09` private key is registered in Vault KV v2 at `secret/data/expo-ota/signing/kosmo-native/2026-09` under `private_key` (version 1), and the public certificate source is `apps/app/certs/certificate.pem`; its recorded validity is 2026-09-10 through 2027-09-10 (KST), with the first rotation scheduled for 2027-03-10. The runbook MUST record evidence for staging verification, protected production promotion, recovery, failed verification, and offline behavior. Publisher read, seed binary, device, and rotation execution evidence remain pending, and dual trust is not part of this contract.

#### Scenario: Rotate trust material with an explicit transition

- **WHEN** signing trust material is rotated
- **THEN** the runbook records the new certificate, runtime, and Store binary for the rotation
- **AND** each existing runtime continues to use its existing certificate without dual trust
- **AND** a release is not promoted using an unrecorded or implicitly changed key

#### Scenario: Verify both seed binary paths on device

- **WHEN** a new OTA-enabled Android binary is distributed through completed PROD-886 Google Play Alpha and an iOS binary through completed PROD-876 TestFlight
- **THEN** PROD-336 installs each binary on a real device and verifies update, rejection, offline fallback, and recovery behavior
- **AND** the evidence identifies the platform, binary, runtimeVersion, OTA channel, and release identity used

#### Scenario: Keep store automation separate from OTA verification

- **WHEN** PROD-287's store-native automation or device flow is unavailable or changes
- **THEN** OTA-specific device verification remains owned by PROD-336 using PROD-886 and PROD-876
- **AND** PROD-287 is treated as related context rather than an OTA blocker
