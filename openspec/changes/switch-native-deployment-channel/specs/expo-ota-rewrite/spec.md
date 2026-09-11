## ADDED Requirements

### Requirement: Cloudflare rewrites a project-qualified manifest request to the existing tuple

**Authority / Provenance:** `docs/operations/expo-ota.md`, PROD-334. The supported Native manifest request MUST be a queryless `GET` to `expo-ota.byulmaru.co` at `/releases/{project}`, where `{project}` is one safe path segment, with `expo-protocol-version: 1`, `expo-platform`, `expo-runtime-version` and `expo-channel-name`. The Rule MUST validate all values and rewrite only the URI path to `/releases/{project}/{platform}/{channel}/{runtimeVersion}/manifest.json`, preserving the project namespace.

#### Scenario: Rewrite a valid project request

- **WHEN** a valid queryless GET targets `/releases/example-project` with platform `ios`, channel `prod` and a valid runtimeVersion
- **THEN** it is internally rewritten to `/releases/example-project/ios/prod/{runtimeVersion}/manifest.json` and the R2 custom domain serves the stored signed multipart manifest

#### Scenario: Reject an incomplete or unsafe request

- **WHEN** a project path lacks a required header or contains an unsafe project, platform, channel or runtimeVersion
- **THEN** the Rule does not construct a tuple path or expose a manifest outside the requested safe project namespace

### Requirement: The rewrite preserves static R2 delivery and publisher contracts

**Authority / Provenance:** `docs/operations/expo-ota.md`, PROD-334, PROD-336. The rewrite MUST preserve the existing tuple and asset layout, signed multipart bytes, immutable asset URLs, publisher contract, and queryless direct `/releases/*` requests. Existing `/releases/*/manifest.json` cache bypass and response-header transforms MUST still match; this capability MUST NOT add a Worker or second public path.

#### Scenario: Keep direct static assets available

- **WHEN** a client requests an existing immutable asset URL from a rewritten manifest
- **THEN** the request reaches the existing R2 object without proxying, mutation or republishing

#### Scenario: Apply existing manifest edge rules

- **WHEN** a valid queryless project request is rewritten to the tuple manifest path
- **THEN** existing cache/response-header rules match and publisher/stored manifest bytes remain unchanged

### Requirement: Missing rewrite targets fail as static-origin 404 responses

**Authority / Provenance:** `docs/operations/expo-ota.md`, PROD-956, PROD-334. When a tuple manifest is absent, the static R2 origin MUST return its 404 unchanged; delivery MUST NOT synthesize a success, empty response or unverified manifest, and Native MUST treat it as a failed update under its fallback requirement.

#### Scenario: Request a channel with no published manifest

- **WHEN** a rewrite target has no `manifest.json`
- **THEN** the static origin returns 404 without a synthetic manifest or successful empty response

#### Scenario: Keep the old executable after 404

- **WHEN** Native receives that static-origin 404 during a channel switch
- **THEN** it restores the original channel override and keeps the existing executable fallback launchable
