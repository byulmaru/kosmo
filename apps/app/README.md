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

## Native test distribution

Ruby, Bundler, Fastlane, and the Firebase App Distribution plugin are locked at the repository root. Install the mise toolchain and gems, then load the platform validation lanes from the app directory:

```sh
mise install
gem install bundler --version 4.0.15 --no-document
bundle install
cd apps/app
bundle exec fastlane lanes
```

The Android and iOS child lanes must provide the following common inputs before prebuild or distribution:

| Input                                                   | Contract                                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `KOSMO_MARKETING_VERSION`                               | Read from `expo config --type public --json`; do not duplicate it in workflow configuration.                                 |
| `KOSMO_ANDROID_BUILD_NUMBER` / `KOSMO_IOS_BUILD_NUMBER` | Positive platform build number. CI uses `GITHUB_RUN_NUMBER * 100 + GITHUB_RUN_ATTEMPT` and rejects attempts at or above 100. |
| `KOSMO_SOURCE_COMMIT`                                   | Exact source commit used by both platform builds.                                                                            |
| `KOSMO_ACTIONS_RUN_URL`                                 | GitHub Actions run that created the release.                                                                                 |
| `KOSMO_RELEASE_NOTES`                                   | Shared commit/run-based release summary.                                                                                     |
| `FIREBASE_ANDROID_APP_ID` / `FIREBASE_IOS_APP_ID`       | Firebase App IDs supplied by the protected `native-test-distribution` environment.                                           |
| `FIREBASE_TESTER_GROUP`                                 | Firebase tester group alias, never a tester email list.                                                                      |

`bundle exec fastlane android validate_distribution_config` and its iOS equivalent validate that contract without generating native projects or uploading a release. PROD-285 and PROD-286 add the signed build and distribution lanes; their outputs must include the Firebase release URL, platform, marketing version, build number, source commit, and artifact metadata for PROD-287 to summarize.

The `Native Distribution Foundation` workflow never grants credentials to pull requests or merge-queue runs. A manual run on `main` uses the protected `native-test-distribution` environment to exchange GitHub OIDC for the short-lived WIF ADC managed by PROD-303, then performs read-only Firebase release lookups. That environment also provides the existing `EXPO_PUBLIC_WEB_ORIGIN`, `EXPO_PUBLIC_OIDC_ISSUER`, and `EXPO_PUBLIC_OIDC_CLIENT_ID` public runtime settings to the platform child workflows. Firebase/WIF identifiers stay in environment variables, and signing material remains owned by the platform child issues.

Pull-request validation uses dummy Firebase App IDs and does not prove that Firebase apps exist. Before the manual `main` smoke can pass, PROD-303 must create or import Android and Apple Firebase apps for `moe.kos`, create the tester group, and populate the protected environment with their real IDs.

The auth action's generated `gha-creds-*.json` file is ignored by Git and Docker, removed explicitly on success or failure, and must not be uploaded as an artifact. Long-lived service-account JSON and Firebase CLI tokens are not supported.

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
