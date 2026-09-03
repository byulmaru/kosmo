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

## Android Google Play closed testing (Alpha)

`Android Google Play Alpha Distribution`은 `main`에서만 수동 실행하는 protected workflow다. 매 실행마다 clean CNG Android project를 만들고, Fastlane이 upload key로 서명한 Release AAB를 빌드해 Google Play closed testing의 Alpha track에 업로드한다. Play가 package name, versionCode, upload certificate를 검증한다. versionCode는 workflow 시작 시 UTC Unix seconds에서 `2020-01-01`을 뺀 값으로 계산하며, 첫 수동 release의 versionCode `1`보다 크고 Android signed 32-bit 범위 안에 있다. Play API를 미리 조회하거나 장기 credential을 저장하지 않는다. 기존 internal testing release는 Play Console에 남아 있으며 이 workflow가 변경하지 않는다.

이 앱의 Play app, Google 관리 Play App Signing, upload key는 이미 설정되어 있다. Alpha track의 첫 signed AAB는 이 workflow가 업로드한다. Play Console에서 다음 Alpha 설정과 CI 자산을 확인한다.

1. closed testing의 Alpha track에 Doply tester 목록을 연결하고 출시 국가/지역에 대한민국을 포함한다.
2. [Terraform outputs](../terraform/README.md)의 `android_play_service_account` service account를 Play Console Users and permissions에 추가하고 `Release apps to testing tracks` 권한만 부여한다.
3. 기존 승인형 `prod` GitHub Environment에 다음 non-secret variable만 넣는다. 새 Environment는 만들지 않는다.

| 이름                             | 종류     | 값                                                              |
| -------------------------------- | -------- | --------------------------------------------------------------- |
| `GCP_SERVICE_ACCOUNT`            | variable | `terraform output -raw android_play_service_account`            |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | variable | `terraform output -raw android_play_workload_identity_provider` |
| `ANDROID_RELEASE_KEY_ALIAS`      | variable | upload key 생성 시 사용한 alias                                 |

4. upload keystore와 두 password는 GitHub에 저장하지 않고 Vault에 저장한다. 운영자가 Vault CLI/UI에서 사용하는 KV v2 logical path는 `secret/kosmo/prod/android-play`다. Workflow와 Vault ACL policy에서 사용하는 KV v2 API path는 `secret/data/kosmo/prod/android-play`이며, `/data/`는 CLI/UI logical path에 포함하지 않는다. 다음 field를 만들고, `kosmo-android-play` GitHub OIDC role이 이 API path를 읽도록 한다.

| Field                             | 값                                 |
| --------------------------------- | ---------------------------------- |
| `ANDROID_RELEASE_KEYSTORE_BASE64` | 줄바꿈 없는 upload keystore base64 |
| `ANDROID_RELEASE_STORE_PASSWORD`  | upload keystore password           |
| `ANDROID_RELEASE_KEY_PASSWORD`    | upload key password                |

`Android Google Play Alpha Distribution`은 조직 수준 `VAULT_ADDR`와 `VAULT_GITHUB_ACTIONS_AUDIENCE`, 저장소 수준 `TAILSCALE_OAUTH_CLIENT_ID`와 `TAILSCALE_AUDIENCE`를 사용한다. Vault tailnet에 접속한 뒤 GitHub OIDC JWT로 `kosmo-android-play` role을 인증하고 실행 중에만 서명 값을 읽는다. Vault role과 policy는 `prod` Environment의 이 workflow만 해당 경로를 읽도록 제한해야 한다.

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

base64 결과와 password는 shell history, 저장소, GitHub 로그에 남기지 말고 위 Vault field에만 기록한다. upload key를 바꿀 때는 Vault field만 교체하지 말고 Play Console의 upload key reset 절차를 먼저 완료한다. 실제 Play Store 설치·업데이트·실기기 launch와 native login/GraphQL 검증은 PROD-287의 책임이며, 이 workflow는 API/OIDC 환경값이나 ADB/device smoke를 요구하지 않는다.

## iOS TestFlight internal distribution

`iOS TestFlight Internal Distribution`은 iOS의 유일한 native 배포 채널로, `main`에서 수동 실행하는 protected workflow다. 기존 `prod` GitHub Environment의 승인을 거쳐 clean Expo CNG iOS project를 만들고, App Store 배포용 profile과 Apple Distribution certificate로 서명한 archive를 검증·업로드한다. 네이티브 모듈 변경이 없는 업데이트는 OTA로 배포한다. 앱은 `expo-secure-store`의 Keychain 저장소를 사용하지만 현재 비면제 암호화를 사용하지 않으므로 `ios.config.usesNonExemptEncryption`을 `false`로 설정한다. 이후 별도 암호화 기능이나 암호화 라이브러리를 추가하면 이 판단과 App Store Connect 수출 규정 응답을 다시 검토해야 한다.

### One-time administrator setup

첫 실행 전에 브라우저에서 다음 순서로 Apple Developer와 App Store Connect를 준비한다.

1. Apple Developer의 Certificates, Identifiers & Profiles에서 팀의 App ID/Bundle ID `moe.kos`를 확인하거나 만든다.
2. App Store Connect의 Apps에서 `moe.kos` 앱 레코드를 확인하거나 만들고 Bundle ID를 `moe.kos`로 연결한다. 계약 동의나 세금·은행 정보가 미완료라면 Account Holder가 먼저 처리한다.
3. Apple Developer에서 Apple Distribution certificate를 만들고, 관리자 장비에서 서명된 `.p12`와 password를 준비한다.
4. 같은 App ID에 대한 App Store 배포용 provisioning profile을 만든 뒤 다운로드한다. Ad Hoc profile은 사용하지 않는다. workflow가 profile에서 Team ID를 추출하므로 `APPLE_DEVELOPER_TEAM_ID` GitHub variable은 추가하지 않는다.
5. App Store Connect의 Users and Access → Integrations → App Store Connect API → Team Keys에서 App Manager 권한의 Team API key를 만든다. P8 파일은 생성 시 한 번만 다운로드할 수 있으므로 즉시 Vault에 넣고, 저장소·로그·artifact에는 남기지 않는다.
6. 앱의 TestFlight → Internal Testing에서 정확히 `Internal Testers` group을 만들고 `Enable automatic distribution`을 끈 manual distribution group으로 설정한 뒤, 해당 그룹에 App Store Connect 사용자 tester를 추가한다. workflow가 build를 이 그룹에 명시적으로 할당하므로 자동 배포 group으로 설정하지 않는다. 외부 tester나 Firebase group은 이 workflow의 대상이 아니다.

Kubernetes의 `kosmo-ios-testflight` role과 read-only policy가 적용된 뒤, Vault 관리자 UI/CLI에서 다음 six fields를 KV v2 logical path `secret/kosmo/prod/ios-signing`에 기록한다. workflow와 ACL이 사용하는 API path는 `secret/data/kosmo/prod/ios-signing`이며, `/data/`는 UI/CLI logical path에 쓰지 않는다.

| Field                                       | 값                                |
| ------------------------------------------- | --------------------------------- |
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64`       | password로 보호한 `.p12`의 base64 |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`     | 해당 `.p12` password              |
| `IOS_APP_STORE_PROVISIONING_PROFILE_BASE64` | App Store profile의 base64        |
| `APPLE_API_KEY_ID`                          | App Store Connect Team API key ID |
| `APPLE_API_ISSUER_ID`                       | App Store Connect API issuer ID   |
| `APPLE_API_KEY_P8_BASE64`                   | Team API key `.p8` 파일의 base64  |

GitHub Actions에서는 새 environment를 만들지 않고 기존 `prod`를 사용한다. `VAULT_ADDR`와 `VAULT_GITHUB_ACTIONS_AUDIENCE`는 organization variable, `TAILSCALE_OAUTH_CLIENT_ID`와 `TAILSCALE_AUDIENCE`는 repository variable로 둔다. iOS signing 값과 API key는 GitHub variable/secret이 아니라 Vault에서 job 실행 중에만 읽는다.

### First upload and verification

`main`에서 workflow를 dispatch하고 `prod` deployment를 승인한다. 첫 실행 전에 위의 Apple 계약·앱 레코드·서명 자산·App Manager API key·`Internal Testers` group과 Vault six fields가 준비되어 있어야 한다. 수출 규정 응답은 현재 설정(`ios.config.usesNonExemptEncryption: false`)에 맞춰 비면제 암호화를 사용하지 않는 것으로 확인한다. workflow는 bundle ID, profile의 Team ID, certificate, version/build metadata를 확인한 뒤 signed IPA 하나만 App Store Connect에 업로드하고, Actions summary에 revision, version/build, processing 상태와 `Internal Testers` group 결과를 남긴다. App Store Connect에서 업로드한 build가 Processing을 끝내고 TestFlight 내부 그룹에 배포되는지 확인한다.

현재 확인되지 않은 운영 게이트는 live workflow JWT에 대한 Vault role/policy의 allow/deny와 첫 upload, App Store Connect processing/group assignment 결과다. 이 문서와 코드만으로 해당 게이트가 완료됐다고 간주하지 않는다.

### Rotation and revoke

새 certificate/profile/API key를 준비한 뒤 해당 Vault field만 교체하고 TestFlight upload와 processing을 확인한 다음 이전 asset을 revoke한다. API key는 수정할 수 없으므로 새 App Manager Team key를 만들고 세 ID/P8 field를 함께 교체한다. 노출이 의심되면 확인을 기다리지 말고 이전 API key와 certificate를 Apple에서 revoke하고, 필요하면 `kosmo-ios-testflight` role/policy를 검토된 Terraform 변경으로 비활성화한다.

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
