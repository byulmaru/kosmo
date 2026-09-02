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

After a successful callback, native login sends only the authorization code, PKCE verifier, and exact redirect URI to the API origin's `/graphql` `exchangeNativeOidcSession` mutation. It does not send raw OIDC tokens.

Native projects are generated with `expo prebuild --clean`; they are not source-of-truth files.

## Android Google Play internal testing

`Android Google Play Internal Distribution`은 `main`에서만 수동 실행하는 protected workflow다. 매 실행마다 clean CNG Android project를 만들고, upload key로 서명한 Release AAB 하나를 빌드·검증한 뒤 Google Play internal track에 업로드한다. versionCode는 workflow 시작 시 UTC Unix seconds에서 `2020-01-01`을 뺀 값으로 계산하며, 첫 수동 release의 versionCode `1`보다 크고 Android signed 32-bit 범위 안에 있다. Play API를 미리 조회하거나 장기 credential을 저장하지 않는다.

첫 배포 전에는 Play Console에서 다음 절차를 수동으로 완료해야 한다. CI가 Play Console의 최초 app/signing bootstrap을 대신하지 않는다.

1. package name `moe.kos`로 app을 만들고 Google Play App Signing을 설정한다.
2. upload key를 관리자 장비에서 생성한다. 첫 AAB와 이후 CI AAB는 같은 upload key로 서명해야 하며, Google이 관리하는 app signing key와는 별개다.
3. Play Console에서 첫 signed AAB 업로드와 internal testing track 생성을 완료하고 tester 목록과 opt-in 링크를 설정한다.
4. [Terraform outputs](../terraform/README.md)의 `android_play_service_account` service account를 Play Console Users and permissions에 추가하고 `Release apps to testing tracks` 권한만 부여한다.
5. 기존 승인형 `prod` GitHub Environment에 다음 non-secret variable만 넣는다. 새 Environment는 만들지 않는다.

| 이름                                 | 종류     | 값                                                              |
| ------------------------------------ | -------- | --------------------------------------------------------------- |
| `GCP_SERVICE_ACCOUNT`                | variable | `terraform output -raw android_play_service_account`            |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`     | variable | `terraform output -raw android_play_workload_identity_provider` |
| `ANDROID_RELEASE_KEY_ALIAS`          | variable | upload key 생성 시 사용한 alias                                 |
| `ANDROID_RELEASE_CERTIFICATE_SHA256` | variable | upload certificate의 SHA-256 fingerprint                        |

6. upload keystore와 두 password는 GitHub에 저장하지 않고 Vault에 저장한다. Vault KV v2 경로 `secret/data/kosmo/prod/android-play`에 다음 field를 만들고, `kosmo-android-play` GitHub OIDC role이 이 경로를 읽도록 한다.

| Field                             | 값                                 |
| --------------------------------- | ---------------------------------- |
| `ANDROID_RELEASE_KEYSTORE_BASE64` | 줄바꿈 없는 upload keystore base64 |
| `ANDROID_RELEASE_STORE_PASSWORD`  | upload keystore password           |
| `ANDROID_RELEASE_KEY_PASSWORD`    | upload key password                |

`Android Google Play Internal Distribution`은 기존 저장소 수준 `TAILSCALE_OAUTH_CLIENT_ID`와 `TAILSCALE_AUDIENCE`로 Vault tailnet에 접속한 뒤, GitHub OIDC JWT로 `kosmo-android-play` role을 인증하고 실행 중에만 이 값을 읽는다. Vault role과 policy는 `prod` Environment의 이 workflow만 해당 경로를 읽도록 제한해야 한다.

upload key 예시는 다음과 같다. password는 명령행이나 저장소에 넣지 말고 `keytool` prompt에서 입력한다.

```sh
umask 077
keytool -genkeypair -v \
  -keystore kosmo-android-upload.jks \
  -storetype JKS \
  -alias kosmo-upload \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
keytool -list -v -keystore kosmo-android-upload.jks
base64 < kosmo-android-upload.jks | tr -d '\n'
```

base64 결과와 password는 shell history, 저장소, GitHub 로그에 남기지 말고 위 Vault field에만 기록한다. `ANDROID_RELEASE_CERTIFICATE_SHA256`은 Play Console에 등록한 upload certificate와 일치해야 한다. upload key를 바꿀 때는 Vault field만 교체하지 말고 Play Console의 upload key reset 절차를 먼저 완료한다. 실제 Play Store 설치·업데이트·실기기 launch와 native login/GraphQL 검증은 PROD-287의 책임이며, 이 workflow는 API/OIDC 환경값이나 ADB/device smoke를 요구하지 않는다.

## iOS Ad Hoc Firebase distribution

The two manual workflows build from a clean CNG project, not a committed `ios/` directory. `IOS_BUILD_NUMBER` is set to the GitHub Actions run ID, so each serialized run has a unique numeric build number. Before upload, Fastlane verifies the generated Xcode team and bundle ID, embedded Ad Hoc profile, distribution certificate, registered devices, IPA build number, and that the number is newer than the latest Firebase iOS release.

- `iOS Ad Hoc Distribution` uses `match(type: "adhoc", readonly: true)` and can only read the signing repository.
- `iOS Device Onboarding` is a separately protected, manually approved workflow. It exports Firebase tester UDIDs, registers them with Apple, renews the Ad Hoc profile, rebuilds, and distributes the resulting IPA.
- Neither workflow uploads an IPA, profile, UDID list, private key, or ADC file as a GitHub artifact. Both delete generated `ios/`, temporary keychains, credentials, and build output on success, failure, or cancellation.

### One-time administrator setup

Enroll the Apple account in the Apple Developer Program, then create or verify the explicit `moe.kos` App ID in Certificates, Identifiers & Profiles for the same team. This only creates the Developer Portal identifier; it does not create an App Store Connect listing. The current CNG configuration does not require any additional App ID capability.

After the Terraform change is applied, create the `native-test-distribution` and `ios-device-onboarding` environments in GitHub. Restrict both to `main`, require `robin-maki` approval only for `ios-device-onboarding`, and add these variables to both environments from the corresponding Terraform outputs:

| Variable                         | Value                                                  |
| -------------------------------- | ------------------------------------------------------ |
| `FIREBASE_IOS_APP_ID`            | `terraform output -raw firebase_ios_app_id`            |
| `FIREBASE_TESTER_GROUP`          | `native-testers`                                       |
| `GCP_SERVICE_ACCOUNT`            | `terraform output -raw gcp_service_account`            |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `terraform output -raw gcp_workload_identity_provider` |
| `MATCH_GIT_URL`                  | `git@github.com:byulmaru/kosmo-ios-signing.git`        |

Add the following non-secret environment variables to both `native-test-distribution` and `ios-device-onboarding`:

| Variable                            | Value                                                   |
| ----------------------------------- | ------------------------------------------------------- |
| `APPLE_DEVELOPER_TEAM_ID`           | Apple Developer Team ID for `moe.kos`                   |
| `EXPO_PUBLIC_API_ORIGIN`            | HTTPS origin of the native test API deployment          |
| `EXPO_PUBLIC_OIDC_ISSUER`           | OIDC issuer used by that test deployment                |
| `EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID` | Public OIDC client that allows `kosmo://login/callback` |

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
