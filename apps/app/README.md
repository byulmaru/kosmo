# Kosmo universal app

Expo Router, React Native, React Native Web, and Relay power the same iOS, Android, and web client.

## Development

```sh
pnpm --filter @kosmo/app dev
pnpm --filter @kosmo/app ios
pnpm --filter @kosmo/app android
pnpm --filter @kosmo/app web
```

Set `EXPO_PUBLIC_WEB_ORIGIN`, `EXPO_PUBLIC_OIDC_ISSUER`, and `EXPO_PUBLIC_OIDC_CLIENT_ID` for native authentication. When Expo evaluates `app.config.ts`, the existing `PUBLIC_ORIGIN`, `PUBLIC_OIDC_ISSUER`, and `PUBLIC_OIDC_CLIENT_ID` Vault values are mapped to those names unless an `EXPO_PUBLIC_*` override is already set. Browser builds use same-origin `/login` and `/graphql` through `@kosmo/web`.

Native `EXPO_PUBLIC_WEB_ORIGIN` must be an HTTPS origin. Loopback HTTP is accepted for local development; a non-loopback HTTP origin requires the explicit development-only `EXPO_PUBLIC_ALLOW_INSECURE_ORIGIN=1` override. SecureStore sessions are bound to the normalized origin and are discarded instead of being sent after an environment change.

Native OIDC uses Expo AuthSession with the `kosmo://login/callback` redirect. Register that exact URI with the provider and test login in a development or standalone build; Expo Go cannot use the custom callback scheme for this flow.

Native projects are generated with `expo prebuild --clean`; they are not source-of-truth files.

## Native iOS build

`apps/app/ios` is generated Expo CNG output and must remain untracked. Reproduce the
unsigned simulator build with:

```sh
pnpm --filter @kosmo/app build:ios
```

The script runs Relay compilation, a clean `expo prebuild --clean --platform ios`,
and an unsigned `xcodebuild` for the iPhone simulator SDK. It preflights the selected
Xcode developer directory and version, accepted Xcode license, iPhone simulator SDK,
and CocoaPods path/version before compiling. Set `KOSMO_KEEP_IOS_BUILD=1` when you
need to inspect the generated `apps/app/ios` project after a local run.

The `Native iOS` CI check runs on a self-hosted macOS runner for `pull_request`,
`merge_group`, and `workflow_dispatch`. The runner must have Xcode selected with
`xcode-select`, an accepted Xcode license, initialized Xcode first-launch simulator
support, the iPhone simulator SDK, CocoaPods, mise, and pnpm. Failure logs are written
under `apps/app/.native-build/ios` and uploaded by CI when the check fails.

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
