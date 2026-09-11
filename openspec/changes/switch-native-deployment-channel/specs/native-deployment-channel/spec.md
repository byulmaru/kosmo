## ADDED Requirements

### Requirement: Native exposes a bounded deployment channel selector

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/breakpoints.md`, PROD-956. Android/iOS Native MUST expose a `채널` row in `정보` and pre-login recovery with only `dev` and `prod`; Web `정보` and Web channel UI MUST remain unchanged.

#### Scenario: Show the current channel after login

- **WHEN** an authenticated Native user opens `정보`
- **THEN** the row shows the active `dev` or `prod` value and the selector offers only those values

#### Scenario: Recover the channel before login

- **WHEN** a Native user opens the pre-login recovery entry point
- **THEN** the same `dev`/`prod` selector is available without Web Settings controls

#### Scenario: Keep Web channel selection unchanged

- **WHEN** a Web user opens `/settings/info` or Web channel selection
- **THEN** the existing policy-link and channel-selection behavior remains unchanged

### Requirement: The selected channel selects one Native environment

**Authority / Provenance:** `docs/design/settings.md`, `docs/operations/sentry.md`, PROD-956. Native MUST resolve one selected channel for API, Web, OIDC, Sentry and OTA, MUST NOT mix channel values, and MUST use `prod` when a Store binary has no override.

#### Scenario: Select the dev environment

- **WHEN** a Native user confirms `dev`
- **THEN** API, Web, OIDC, Sentry and OTA use `dev` and no `prod` value

#### Scenario: Use the Store default

- **WHEN** a Store binary starts without a channel override
- **THEN** it uses the `prod` environment and OTA channel

### Requirement: Native requests use the fixed manifest URL and persistent channel header

**Authority / Provenance:** `docs/operations/expo-ota.md`, PROD-956, PROD-334. Native MUST use `https://expo-ota.byulmaru.co/releases/kosmo-native` as `updates.url` and send `expo-platform`, `expo-runtime-version` and `expo-channel-name`, with the selected channel in the last header.

#### Scenario: Request a prod Android manifest

- **WHEN** a Native Android binary checks for an update on `prod`
- **THEN** it requests the fixed URL with Android, its runtimeVersion and `expo-channel-name: prod`

#### Scenario: Persist the selected channel across reload

- **WHEN** a user confirms another channel and the compatible update installs
- **THEN** the request-header override survives reload and `Updates.channel` reports the relaunched channel

### Requirement: Native changes channel only after a compatible update succeeds

**Authority / Provenance:** `docs/design/settings.md`, `docs/operations/expo-ota.md`, PROD-956. Cancel/current selection MUST be a no-op; a different channel MUST pass compatible signed update verification and download before login deletion and `Updates.reloadAsync()`. Discovery, static 404, download, signature, asset-hash or compatibility failure MUST restore the original override and executable fallback.

#### Scenario: Cancel or select the current channel

- **WHEN** the user cancels or confirms the active channel
- **THEN** channel header, login, update and reload state do not change

#### Scenario: Apply a compatible update before switching

- **WHEN** the user confirms another channel and a signed compatible update downloads successfully
- **THEN** Native deletes the current login and calls `Updates.reloadAsync()` for the selected channel

#### Scenario: Restore the original channel after a missing manifest

- **WHEN** the rewrite target has no manifest and the static origin returns 404
- **THEN** Native treats the attempt as failed, restores the original channel and keeps its executable fallback

#### Scenario: Reject an invalid update

- **WHEN** signature, asset hash, compatibility or download verification fails
- **THEN** Native does not delete login or reload into the target and restores the original executable fallback
