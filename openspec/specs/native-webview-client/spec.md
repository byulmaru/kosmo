## Purpose

kosmo 네이티브 WebView 클라이언트의 현재 계약을 문서화한다. 이 스펙은 Android WebView shell과 iOS WKWebView shell이 웹 앱을 호스팅하고 네이티브 OIDC 로그인을 연결하는 동작을 다룬다.

## Requirements

### Requirement: Native WebView shell

네이티브 앱은 kosmo 웹 origin을 WebView로 호스팅해야 한다(MUST).

#### Scenario: Launch native app

- **WHEN** 네이티브 앱이 처음 실행된다
- **THEN** Android는 `WebView`를 화면 전체에 표시한다
- **AND** iOS는 `WKWebView`를 화면 전체에 표시한다
- **AND** WebView는 설정된 web origin을 로드한다

#### Scenario: Configure WebView storage and JavaScript

- **WHEN** 네이티브 WebView가 생성된다
- **THEN** Android WebView는 JavaScript, DOM storage, cookie 수신을 활성화한다
- **AND** iOS WKWebView는 기본 website data store를 사용한다

### Requirement: Native app user agent

네이티브 앱은 웹 서버가 네이티브 WebView 요청을 식별할 수 있도록 user-agent에 `KosmoApp/<version>` 값을 포함해야 한다(MUST).

#### Scenario: Android user agent

- **WHEN** Android WebView가 웹 요청을 보낸다
- **THEN** user-agent는 기본 WebView user-agent 뒤에 `KosmoApp/<app version>`을 포함한다

#### Scenario: iOS user agent

- **WHEN** iOS WKWebView가 웹 요청을 보낸다
- **THEN** application name user-agent 값은 `KosmoApp/<app version>`이다
- **AND** 앱 버전을 알 수 없으면 `KosmoApp/0.0.0`을 사용한다

### Requirement: Native login handoff

네이티브 앱은 웹 `/login/native` handoff를 가로채 시스템 브라우저 기반 OIDC 로그인을 시작해야 한다(MUST).

#### Scenario: Intercept native login route

- **WHEN** WebView가 설정된 web origin의 `/login/native`로 이동한다
- **THEN** 네이티브 앱은 WebView navigation을 중단한다
- **AND** URL의 `state`와 `code_challenge` query parameter를 읽는다

#### Scenario: Start Android native login

- **WHEN** Android 앱이 `/login/native`에서 state와 code challenge를 받는다
- **THEN** 앱은 OIDC authorize URL을 생성한다
- **AND** redirect URI는 `kosmo://login/callback`이다
- **AND** scope는 `openid profile`이다
- **AND** code challenge method는 `S256`이다
- **AND** 앱은 Custom Tabs로 authorize URL을 연다

#### Scenario: Start iOS native login

- **WHEN** iOS 앱이 `/login/native`에서 state와 code challenge를 받는다
- **THEN** 앱은 OIDC authorize URL을 생성한다
- **AND** redirect URI는 `kosmo://login/callback`이다
- **AND** scope는 `openid profile`이다
- **AND** code challenge method는 `S256`이다
- **AND** 앱은 `ASWebAuthenticationSession`으로 authorize URL을 연다

#### Scenario: Missing native login configuration

- **WHEN** 네이티브 앱에 OIDC client ID가 설정되어 있지 않다
- **THEN** 앱은 네이티브 로그인을 시작하지 않는다

### Requirement: Native login callback handling

네이티브 앱은 `kosmo://login/callback` callback을 검증한 뒤 웹 callback endpoint로 전달해야 한다(MUST).

#### Scenario: Register callback route

- **WHEN** OIDC provider가 `kosmo://login/callback`으로 리다이렉트한다
- **THEN** Android 앱은 `kosmo` scheme, `login` host, `/callback` path의 VIEW intent를 받을 수 있다
- **AND** iOS 앱은 `kosmo` callback URL scheme을 사용하는 authentication session callback을 받을 수 있다

#### Scenario: Accept valid native callback

- **WHEN** 네이티브 앱이 `kosmo://login/callback` callback에서 authorization code와 state를 받는다
- **THEN** 앱은 callback state가 저장된 login state와 같은지 확인한다
- **AND** state가 일치하면 web origin의 `/login/callback`을 WebView에 로드한다
- **AND** WebView callback URL은 code, state, `redirect_uri=kosmo://login/callback` query parameter를 포함한다
- **AND** 저장된 login state는 callback 전달 후 초기화된다

#### Scenario: Ignore invalid native callback

- **WHEN** callback route가 `kosmo://login/callback`이 아니거나 code가 없거나 state가 없거나 state가 저장된 login state와 다르다
- **THEN** 네이티브 앱은 callback을 웹 callback endpoint로 전달하지 않는다

### Requirement: Native navigation behavior

네이티브 앱은 WebView 내 웹 탐색과 외부 URL 탐색을 분리해야 한다(MUST).

#### Scenario: Android external URL

- **WHEN** Android WebView가 http 또는 https가 아닌 URL로 이동한다
- **THEN** 앱은 처리 가능한 외부 activity가 있으면 해당 activity를 연다
- **AND** WebView navigation은 앱에서 처리된 것으로 간주한다

#### Scenario: Android back navigation

- **WHEN** Android 사용자가 뒤로 가기를 실행하고 WebView history가 있다
- **THEN** 앱은 activity를 종료하지 않고 WebView에서 뒤로 이동한다

#### Scenario: iOS navigation failure

- **WHEN** iOS WKWebView navigation 또는 provisional navigation이 실패한다
- **THEN** 앱은 실패 내용을 로그로 기록한다
