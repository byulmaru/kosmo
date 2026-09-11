## ADDED Requirements

### Requirement: Static R2 delivery resolves the canonical OTA namespace

**Authority / Provenance:** explicit user-approved repository boundary; `PROD-331`, `PROD-332`, `PROD-334`; 적용되는 `docs/domain`·`docs/design` canonical delivery 문서 없음. The organization-shared static R2 endpoint and publisher Action/reusable workflow MUST be owned by public `byulmaru/expo-ota`; its delivery MUST serve a fixed path using logical project `kosmo-native`, platform(`ios` or `android`), a safe single path segment OTA channel using only `[A-Za-z0-9._-]+` except the exact values `.` and `..`, and `runtimeVersion`. The namespace MUST be carried by the delivery URL, and `runtimeVersion` alone MUST NOT identify a project. Delivery MUST expose read-only multipart manifest and asset retrieval for this namespace. Deploy workflow mappings `dev` and `prod` are logical values and MUST NOT become a channel allowlist.

#### Scenario: Resolve a namespace-specific prod manifest

- **WHEN** a client requests the fixed manifest path for `kosmo-native`, `ios`, `prod`, and its `runtimeVersion`
- **THEN** the static origin serves only the corresponding tuple object
- **AND** it returns the multipart manifest for that namespace and compatible runtime

#### Scenario: Isolate platform and channel namespaces

- **WHEN** Android and iOS, or dev and prod, request otherwise identical release identifiers
- **THEN** the static origin resolves each path to its own platform/channel namespace
- **AND** one namespace cannot read another namespace's manifest through runtimeVersion alone

#### Scenario: Reject an unsafe channel path

- **WHEN** a request contains an empty channel, a channel containing `/` or `\\`, or the exact values `.` or `..`
- **THEN** the static origin rejects the path
- **AND** it does not resolve an object outside the requested channel segment

### Requirement: Static R2 serves complete immutable releases

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-334`, `PROD-335`. R2 MUST retain content-addressed assets as immutable content and MUST serve a multipart manifest only after every referenced asset has either been uploaded with its precomputed SHA-256 in standard Base64 supplied to `PutObject` for server-side verification or been reused as an existing immutable object after an `IfNoneMatch: "*"` upload returns HTTP 412. The fixed tuple `manifest.json` object MAY be replaced only with a complete signed release record; delivery MUST NOT mutate the bytes at an already-published asset identity. A manifest or asset publication failure MUST leave the previously serving complete release available.

#### Scenario: Publish a complete fixed manifest

- **WHEN** the multipart manifest and every referenced asset for a release have been prepared and verified
- **THEN** the fixed tuple `manifest.json` object is replaced with that complete signed release record
- **AND** subsequent reads return a self-consistent multipart manifest and asset set

#### Scenario: Do not expose a partial release

- **WHEN** an asset upload, verification, or fixed manifest update fails
- **THEN** the incomplete release is not written as the fixed tuple manifest
- **AND** the previously complete release remains available

#### Scenario: Preserve published asset bytes

- **WHEN** an asset URL or release identity has already been served to a client
- **THEN** later publishing does not replace its bytes in place
- **AND** a new content identity is used for a changed asset

### Requirement: Static R2 serving does not hold signing credentials

**Authority / Provenance:** `PROD-331`, `PROD-332`, `PROD-334`, `PROD-335`. The static R2 origin MUST serve only already-signed multipart manifest and immutable asset bytes. It MUST NOT sign, publish, or contain a signing private key or release credential; signature verification is performed by the client using the public certificate bundled in its native binary. Unknown namespace or missing release MUST fail closed at delivery, while an invalid manifest or asset reference MUST be rejected by the client without presenting an unverified update.

#### Scenario: Serve a signed manifest without a private key

- **WHEN** a valid namespace request targets a complete signed release
- **THEN** the static origin serves the multipart manifest and immutable assets as stored
- **AND** the static R2 runtime has no signing private key or publishing credential

#### Scenario: Reject an invalid release response

- **WHEN** a manifest signature, fixed manifest, or referenced asset cannot be verified after a namespace response
- **THEN** the client does not present that release as an applicable update
- **AND** the client remains able to use its valid fallback
