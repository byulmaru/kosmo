# Kosmo universal app

Expo Router, React Native, React Native Web, and Relay power the same iOS, Android, and web client.

## Development

```sh
pnpm --filter @kosmo/app dev
pnpm --filter @kosmo/app ios
pnpm --filter @kosmo/app android
pnpm --filter @kosmo/app web
```

Set `EXPO_PUBLIC_API_ORIGIN`, `EXPO_PUBLIC_OIDC_ISSUER`, and `EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID` for native authentication. When Expo evaluates `app.config.ts`, `PUBLIC_API_ORIGIN`, `PUBLIC_OIDC_ISSUER`, and `PUBLIC_OIDC_NATIVE_CLIENT_ID` are mapped to those names unless an `EXPO_PUBLIC_*` override is already set. Browser builds keep same-origin `/login` and `/graphql` through `@kosmo/web`.

Native `EXPO_PUBLIC_API_ORIGIN` must be an HTTPS origin. Loopback HTTP is accepted for local development; a non-loopback HTTP origin requires the explicit development-only `EXPO_PUBLIC_ALLOW_INSECURE_ORIGIN=1` override. SecureStore sessions are bound to the normalized API origin, issuer, and native client ID, and are discarded instead of being sent after a configuration change.

Native OIDC uses Expo AuthSession with the `kosmo://login/callback` redirect. Register that exact URI with the provider and test login in a development or standalone build; Expo Go cannot use the custom callback scheme for this flow.

Native projects are generated with `expo prebuild --clean`; they are not source-of-truth files.

## iOS Ad Hoc Firebase distribution

The two manual workflows build from a clean CNG project, not a committed `ios/` directory. `IOS_BUILD_NUMBER` is set to the GitHub Actions run ID, so each serialized run has a unique numeric build number. Before upload, Fastlane verifies the generated Xcode team and bundle ID, embedded Ad Hoc profile, distribution certificate, registered devices, IPA build number, and that the number is newer than the latest Firebase iOS release.

- `iOS Ad Hoc Distribution` uses `match(type: "adhoc", readonly: true)` and can only read the signing repository.
- `iOS Device Onboarding` is a separately protected, manually approved workflow. It exports Firebase tester UDIDs, registers them with Apple, renews the Ad Hoc profile, rebuilds, and distributes the resulting IPA.
- Neither workflow uploads an IPA, profile, UDID list, private key, or ADC file as a GitHub artifact. Both delete generated `ios/`, temporary keychains, credentials, and build output on success, failure, or cancellation.

### One-time administrator setup

Enroll the Apple account in the Apple Developer Program, then create or verify the explicit `moe.kos` App ID in Certificates, Identifiers & Profiles for the same team. This only creates the Developer Portal identifier; it does not create an App Store Connect listing. The current CNG configuration does not require any additional App ID capability.

After the Terraform change is applied, run the repository's existing bootstrap script so both protected environments receive the Firebase/WIF variables and the `git@github.com:byulmaru/kosmo-ios-signing.git` match URL.

```sh
cd apps/terraform
./scripts/ensure-github.sh
```

Add the following non-secret environment variables to both `native-test-distribution` and `ios-device-onboarding`:

| Variable                     | Value                                              |
| ---------------------------- | -------------------------------------------------- |
| `APPLE_DEVELOPER_TEAM_ID`    | Apple Developer Team ID for `moe.kos`              |
| `EXPO_PUBLIC_WEB_ORIGIN`     | HTTPS origin of the native test web/BFF deployment |
| `EXPO_PUBLIC_OIDC_ISSUER`    | OIDC issuer used by that test deployment           |
| `EXPO_PUBLIC_OIDC_CLIENT_ID` | OIDC client that allows `kosmo://login/callback`   |

Create two different SSH deploy keys for `byulmaru/kosmo-ios-signing`. Add the public read-only key to the repository and place its private key in `native-test-distribution` as `MATCH_READONLY_PRIVATE_KEY`. Add the public write key with write access to the repository and place its private key only in `ios-device-onboarding` as `MATCH_WRITE_PRIVATE_KEY`.

Both environments need the same randomly generated `MATCH_PASSWORD` secret. It encrypts every certificate and profile stored by fastlane match. Only `ios-device-onboarding` also receives these Apple Team Key secrets:

- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER_ID`
- `APPLE_API_KEY_P8` — the raw `.p8` file content

Use an App Store Connect **Team Key** with provisioning access. Do not place any of these values in repository variables, source files, logs, or ordinary artifacts.

### First tester and device update flow

1. Add the tester's Google account to Firebase group `native-testers`.
2. On the iPhone, open the Firebase invitation in Safari, accept it, and install the Firebase profile when prompted. This registers the device with Firebase; it does not yet make the current IPA installable on that new device.
3. From `main`, dispatch `iOS Device Onboarding` and approve the `ios-device-onboarding` deployment. The lane imports the UDIDs into Apple, updates only the Ad Hoc match profile, creates a new IPA, verifies that the profile includes the exported device IDs, and uploads it to Firebase.
4. Install the new release from the Firebase tester web clip. Verify launch, the `kosmo://login/callback` redirect, OIDC login, and a basic GraphQL request.
5. Dispatch `iOS Ad Hoc Distribution` once more from `main`, then install that next release on the same iPhone to verify the update path.

If an onboarding run reports no UDIDs, do not retry the signing lane. Ask the tester to complete the Firebase Safari/profile registration first. Rotate a deploy key, `MATCH_PASSWORD`, or Apple Team Key by replacing the corresponding environment secret; use the onboarding environment only when profile/device changes are required.

## Validation

```sh
pnpm --filter @kosmo/app check
pnpm --filter @kosmo/app test:unit
pnpm --filter @kosmo/app export:web
pnpm --filter @kosmo/app build-storybook
pnpm --filter @kosmo/app test:storybook
```

The workspace enforces a seven-day `minimumReleaseAge`. Until the latest Expo SDK 56 patch releases age into that window, the dependency-version recommendation is checked separately from the other Expo Doctor diagnostics:

```sh
cd apps/app
pnpm dlx expo-doctor@1.20.0 .
EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1 pnpm dlx expo-doctor@1.20.0 .
```

Run the unfiltered check first and verify that only age-window package recommendations remain before using the qualified command. Do not bypass the workspace age policy to silence the recommendation. Upgrade the Expo patch set together after pnpm accepts it, then return to the unfiltered check.
