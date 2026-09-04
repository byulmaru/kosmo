## MODIFIED Requirements

### Requirement: Native system-browser login

**Authority / Provenance**: 현재 canonical `openspec/specs/native-webview-client/spec.md`, [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)

네이티브 앱은 Web과 공유하는 하나의 Kosmo confidential OIDC application의 client ID로 authorization code with PKCE 로그인을 system browser session에서 수행해야 한다(MUST). Native 앱은 client secret을 보유하거나 authorize 요청에 포함해서는 안 된다(MUST NOT).

#### Scenario: Start native login

- **WHEN** 사용자가 네이티브 온보딩에서 로그인을 시작한다
- **THEN** 앱은 공유 application의 client ID, random state, PKCE verifier, S256 code challenge를 사용한다
- **AND** OIDC authorize URL의 redirect URI는 `kosmo://login/callback`이다
- **AND** 앱은 Expo AuthSession과 system browser를 사용해 authorize URL을 연다
- **AND** 앱은 client secret을 포함하지 않는다

#### Scenario: Reject invalid callback

- **WHEN** callback의 route, code 또는 state가 요청과 일치하지 않는다
- **THEN** 앱은 code를 session exchange endpoint로 보내지 않는다
- **AND** 인증되지 않은 상태를 유지한다

### Requirement: Native secure session

**Authority / Provenance**: 현재 canonical `openspec/specs/native-webview-client/spec.md`, [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)

네이티브 앱은 OIDC code를 공개 API origin의 unauthenticated `exchangeNativeOidcSession` GraphQL mutation에 보내고, API가 Web과 공유하는 confidential OIDC application의 client ID와 server-held client secret으로 교환한 Kosmo session token만 platform secure storage에 보관해야 한다(MUST). Native 앱은 client secret을 보유하거나 API에 전송해서는 안 된다(MUST NOT). 웹 BFF는 새 native bundle의 session 교환 경로가 아니어야 한다(MUST).

#### Scenario: Complete native login

- **WHEN** system browser가 유효한 authorization code와 state를 반환한다
- **THEN** 앱은 code, PKCE verifier, `kosmo://login/callback` redirect URI를 validated HTTPS API origin의 `/graphql`에 `exchangeNativeOidcSession` mutation input으로 보낸다
- **AND** API는 shared application client ID와 server-held client secret으로 OIDC code를 교환한다
- **AND** 앱은 응답의 Kosmo session token만 Expo SecureStore에 저장한다
- **AND** 이후 Relay 요청은 API origin에 session token을 Bearer 인증으로 사용한다
- **AND** 앱은 client secret, authorization code, PKCE verifier, ID token 또는 access token을 저장하지 않는다

#### Scenario: Restart signed-in app

- **WHEN** 현재 API origin 및 공유 OIDC issuer/client ID 설정과 일치하는 Kosmo session token이 SecureStore에 있고 앱을 다시 실행한다
- **THEN** 앱은 token을 복원하고 API origin의 `currentSession` query로 유효성을 확인한다
- **AND** 유효하면 보호 화면에 접근할 수 있다

#### Scenario: Discard invalid stored session

- **WHEN** 저장된 token으로 API origin의 `currentSession`이 `null`을 반환한다
- **THEN** 앱은 저장된 token을 삭제한다
- **AND** 보호 route에서 공개 온보딩으로 이동한다

#### Scenario: Discard an invalid session envelope

- **WHEN** SecureStore session envelope이 malformed이거나 API origin, 공유 OIDC issuer 또는 공유 client ID가 현재 설정과 다르다
- **THEN** 앱은 저장 값을 삭제하고 token을 복원하지 않는다
- **AND** 저장된 token을 API에 전송하지 않는다
