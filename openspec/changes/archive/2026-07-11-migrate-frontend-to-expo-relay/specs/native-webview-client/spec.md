## ADDED Requirements

### Requirement: Native Expo application

네이티브 앱은 Expo Router와 React Native가 직접 렌더링하는 Android/iOS 애플리케이션이어야 한다(MUST).

#### Scenario: Launch native application

- **WHEN** 사용자가 Android 또는 iOS 앱을 실행한다
- **THEN** 앱은 Expo Router root를 렌더한다
- **AND** 앱의 화면을 원격 web origin의 WebView로 렌더하지 않는다

### Requirement: Native system-browser login

네이티브 앱은 authorization code with PKCE 로그인을 system browser session으로 수행해야 한다(MUST).

#### Scenario: Start native login

- **WHEN** 사용자가 네이티브 온보딩에서 로그인을 시작한다
- **THEN** 앱은 random state, PKCE verifier, S256 code challenge를 생성한다
- **AND** OIDC authorize URL의 redirect URI는 `kosmo://login/callback`이다
- **AND** 앱은 Expo AuthSession과 system browser를 사용해 authorize URL을 연다

#### Scenario: Reject invalid callback

- **WHEN** callback의 route, code 또는 state가 요청과 일치하지 않는다
- **THEN** 앱은 code를 session exchange endpoint로 보내지 않는다
- **AND** 인증되지 않은 상태를 유지한다

### Requirement: Native secure session

네이티브 앱은 OIDC code를 web BFF에서 Kosmo session token으로 교환하고 token을 platform secure storage에 보관해야 한다(MUST).

#### Scenario: Complete native login

- **WHEN** system browser가 유효한 authorization code와 state를 반환한다
- **THEN** 앱은 code, PKCE verifier, redirect URI를 HTTPS native session endpoint로 보낸다
- **AND** 응답의 Kosmo session token을 Expo SecureStore에 저장한다
- **AND** 이후 Relay 요청은 session token을 Bearer 인증으로 사용한다

#### Scenario: Restart signed-in app

- **WHEN** 유효한 Kosmo session token이 SecureStore에 있고 앱을 다시 실행한다
- **THEN** 앱은 token을 복원하고 `currentSession` query로 유효성을 확인한다
- **AND** 유효하면 보호 화면에 접근할 수 있다

#### Scenario: Discard invalid stored session

- **WHEN** 저장된 token으로 `currentSession`이 `null`을 반환한다
- **THEN** 앱은 저장된 token을 삭제한다
- **AND** 보호 route에서 공개 온보딩으로 이동한다

### Requirement: Expo native navigation behavior

네이티브 앱은 Expo Router history와 platform back behavior를 사용하고, 외부 origin은 system browser로 열어야 한다(MUST).

#### Scenario: Navigate back

- **WHEN** 사용자가 Android back 또는 iOS navigation back을 실행하고 이전 Expo route가 있다
- **THEN** 앱은 이전 route로 이동한다

#### Scenario: Open external URL

- **WHEN** 사용자가 Kosmo canonical origin이 아닌 http 또는 https URL을 활성화한다
- **THEN** 앱은 해당 URL을 system browser로 연다

## REMOVED Requirements

### Requirement: Native WebView shell

**Reason**: 네이티브 화면을 React Native로 직접 렌더하는 Expo 앱으로 교체한다.
**Migration**: `apps/app`의 Kotlin `WebView`와 Swift `WKWebView` 구현을 Expo Router root와 공용 화면으로 대체한다.

### Requirement: Native app user agent

**Reason**: 서버가 WebView user-agent로 네이티브 앱을 구분할 필요가 없다.
**Migration**: platform 구분은 native login endpoint와 Bearer transport에서 명시적으로 처리한다.

### Requirement: Native login handoff

**Reason**: `/login/native` WebView 가로채기 대신 Expo AuthSession이 authorization 요청을 직접 시작한다.
**Migration**: 네이티브 앱은 PKCE 요청을 생성하고 `/login/native/session`에서 code를 교환한다.

### Requirement: Native login callback handling

**Reason**: callback을 WebView의 web callback으로 다시 전달하지 않는다.
**Migration**: Expo Router/AuthSession callback이 state를 검증하고 native session endpoint를 호출한다.

### Requirement: Native navigation behavior

**Reason**: WebView history와 navigation delegate 계약을 제거한다.
**Migration**: 동일 이름의 새 요구사항에 정의한 Expo Router 및 system browser 동작을 사용한다.
