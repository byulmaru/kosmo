## ADDED Requirements

### Requirement: Native exposes a bounded deployment channel selector

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/breakpoints.md`, `PROD-956` Android and iOS Native MUST expose a `채널` row in `정보` that displays the current `dev` or `prod` value and
MUST offer only those two values for selection. The same selector entry MUST be available from the pre-login
Native recovery entry point. Web `정보` and Web channel selection UI MUST remain unchanged.

#### Scenario: Show the current channel after login

- **WHEN** an authenticated Native user opens `정보`
- **THEN** the `채널` row displays the currently active `dev` or `prod` value
- **AND** the selector offers only `dev` and `prod`

#### Scenario: Recover the channel before login

- **WHEN** a Native user is on the pre-login recovery entry point
- **THEN** the same `dev`/`prod` selector is available
- **AND** selecting a channel does not expose Web Settings controls

#### Scenario: Keep Web channel selection unchanged

- **WHEN** a Web user opens `/settings/info` or the Web channel selection UI
- **THEN** the existing Web policy-link and channel-selection behavior remains unchanged

### Requirement: The selected channel selects one Native environment

**Authority / Provenance:** `docs/design/settings.md`, `docs/operations/sentry.md`, `PROD-956` Native MUST resolve the selected channel as one environment for the API origin, Web origin, OIDC login environment,
Sentry environment, and OTA channel. Native MUST NOT combine values from different channels, and a Store binary
without a user selection MUST start with `prod`.

#### Scenario: Select the dev environment

- **WHEN** a Native user confirms `dev`
- **THEN** API, Web, OIDC, Sentry, and OTA reads use the `dev` environment
- **AND** no value is taken from the `prod` environment

#### Scenario: Use the Store default

- **WHEN** a Store binary starts without a channel override
- **THEN** it uses the `prod` environment and OTA channel

### Requirement: Native requests use the fixed manifest URL and persistent channel header

**Authority / Provenance:** `docs/operations/expo-ota.md`, `PROD-956`, `PROD-334` Native MUST use `https://expo-ota.byulmaru.co/releases/kosmo-native` as its `updates.url`. Its manifest request MUST
carry `expo-platform`, `expo-runtime-version`, and `expo-channel-name` headers, with the selected channel represented
by `expo-channel-name`.

#### Scenario: Request a prod Android manifest

- **WHEN** a Native Android binary checks for an update on `prod`
- **THEN** it requests the fixed manifest URL
- **AND** the request carries the Android platform, binary runtimeVersion, and `expo-channel-name: prod`

#### Scenario: Persist the selected channel across reload

- **WHEN** a Native user confirms a different channel and the compatible update is installed
- **THEN** the request-header override is retained through the reload
- **AND** `Updates.channel` reports the channel that the relaunched app started with

### Requirement: Native changes channel only after a compatible update succeeds

**Authority / Provenance:** `docs/design/settings.md`, `docs/operations/expo-ota.md`, `PROD-956` Cancelling the selector or choosing the current channel MUST be a no-op. For a different channel, Native MUST verify
and download a compatible signed update before changing the active session. Only after both operations succeed MAY it
delete the current Native login and call `Updates.reloadAsync()`. If discovery, a static-origin 404, download,
signature, asset-hash, or compatibility verification fails, Native MUST restore the original channel override and
preserve the original channel with its last-known-good or embedded executable update.

#### Scenario: Cancel or select the current channel

- **WHEN** the user cancels or confirms the channel already active
- **THEN** the channel header, Native login, update, and reload state do not change

#### Scenario: Apply a compatible update before switching

- **WHEN** the user confirms a different channel
- **AND** a signed update matches the binary project, platform, channel, and runtimeVersion and downloads successfully
- **THEN** Native deletes the current login
- **AND** Native calls `Updates.reloadAsync()` to start the selected channel

#### Scenario: Restore the original channel after a missing manifest

- **WHEN** the rewrite target has no manifest and the static origin returns 404
- **THEN** Native treats the update attempt as failed
- **AND** it restores the original channel and keeps the last-known-good or embedded executable update

#### Scenario: Reject an invalid update

- **WHEN** signature, asset hash, compatibility, or download verification fails
- **THEN** Native does not delete the current login or reload into the target channel
- **AND** it restores the original channel and executable fallback
