## ADDED Requirements

### Requirement: Cloudflare rewrites a project-qualified manifest request to the existing tuple

**Authority / Provenance:** `docs/operations/expo-ota.md`, `PROD-334` The supported Native manifest request MUST be a
queryless `GET` request to host `expo-ota.byulmaru.co` with a path of the form `/releases/{project}`, where `{project}`
is one safe path segment, and the required `expo-protocol-version: 1`, `expo-platform`, `expo-runtime-version`, and
`expo-channel-name` headers. The Cloudflare URL Rewrite Rule MUST match that request, validate the project, platform,
runtimeVersion, and safe single-segment channel values, then rewrite only the URI path to
`/releases/{project}/{platform}/{channel}/{runtimeVersion}/manifest.json` using the path project and header values.
The rule MUST preserve the requested project namespace and MUST NOT use runtimeVersion alone to identify a project.
Query-bearing probes remain outside this change's supported manifest contract.

#### Scenario: Rewrite a valid project request

- **WHEN** a valid queryless GET request targets `/releases/example-project` with platform `ios`, channel `prod`, and a valid runtimeVersion
- **THEN** the request is internally rewritten to `/releases/example-project/ios/prod/{runtimeVersion}/manifest.json`
- **AND** the R2 custom domain serves the stored signed multipart manifest bytes

#### Scenario: Reject an incomplete or unsafe request

- **WHEN** a project-qualified path is requested without a required header or with an unsafe project, platform, channel,
  or runtimeVersion value
- **THEN** the rule does not construct a tuple path from that request
- **AND** it does not expose a manifest outside the requested safe project namespace

### Requirement: The rewrite preserves static R2 delivery and publisher contracts

**Authority / Provenance:** `docs/operations/expo-ota.md`, `PROD-334`, `PROD-336` The rewrite MUST preserve the existing `releases/{project}/{platform}/{channel}/{runtimeVersion}/manifest.json`
and asset object layout, signed multipart response bytes, immutable asset URLs, and public publisher contract. Direct
queryless `/releases/*` manifest and asset requests MUST continue to work. Existing `/releases/*/manifest.json` cache bypass and
response-header transform rules MUST continue to match the rewritten manifest target. This capability MUST NOT add a
Worker endpoint or a second public path.

#### Scenario: Keep direct static assets available

- **WHEN** a client requests an existing immutable asset URL referenced by a rewritten manifest
- **THEN** the request reaches the existing R2 asset object
- **AND** the rewrite capability does not proxy, mutate, or republish the asset

#### Scenario: Apply existing manifest edge rules

- **WHEN** a valid queryless project-qualified request is rewritten to `/releases/{project}/{platform}/{channel}/{runtimeVersion}/manifest.json`
- **THEN** the existing manifest cache bypass and response-header transform rules match that target
- **AND** the publisher and stored manifest bytes remain unchanged

### Requirement: Missing rewrite targets fail as static-origin 404 responses

**Authority / Provenance:** `docs/operations/expo-ota.md`, `PROD-956`, `PROD-334` When the rewritten tuple manifest does not exist, the static R2 origin MUST return its 404 response unchanged. The
delivery path MUST NOT synthesize a successful response, custom empty response, or unverified manifest. Native MUST
handle that 404 as a failed update attempt under the Native fallback requirement.

#### Scenario: Request a channel with no published manifest

- **WHEN** the rewrite target tuple has no `manifest.json` object
- **THEN** the static origin returns 404
- **AND** no synthetic manifest or successful empty response is returned

#### Scenario: Keep the old executable after 404

- **WHEN** Native receives the static-origin 404 during a channel switch
- **THEN** Native restores the original channel override
- **AND** the existing executable fallback remains launchable
