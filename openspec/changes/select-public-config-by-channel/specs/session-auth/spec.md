## MODIFIED Requirements

### Requirement: OIDC PKCE 로그인 시작

**Authority / Provenance**: 현재 canonical `openspec/specs/session-auth/spec.md`, [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)

웹 애플리케이션은 `/login` 요청에서 Web·Native가 함께 사용하는 하나의 Kosmo confidential OIDC application으로 browser authorization code with PKCE 로그인을 시작해야 한다(MUST). 네이티브 앱은 이 endpoint의 user-agent 분기를 사용하지 않고 같은 application의 client ID로 자체 AuthSession 흐름을 사용한다. Client secret은 Web BFF와 API 서버에만 존재해야 한다(MUST NOT be included in the Native bundle).

#### Scenario: 브라우저 로그인 시작

- **WHEN** 사용자가 웹에서 `/login`에 GET 요청을 보낸다
- **THEN** 시스템은 10분 동안 유효한 HTTP-only `kosmo_oidc_state` 쿠키와 `kosmo_oidc_code_verifier` 쿠키를 `/login/callback` 경로에 설정한다
- **AND** 시스템은 Web·Native가 공유하는 Kosmo confidential OIDC application의 client ID와 함께 `response_type=code`, 현재 origin의 `/login/callback` redirect URI, `openid profile` scope, S256 code challenge, state를 포함하여 OIDC authorize URL로 리다이렉트한다
- **AND** client secret은 브라우저나 Native client에 전달하지 않는다

### Requirement: OIDC callback 처리

**Authority / Provenance**: 현재 canonical `openspec/specs/session-auth/spec.md`, [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)

웹 애플리케이션은 `/login/callback`에서 browser login code를 Web·Native가 공유하는 Kosmo confidential OIDC application으로 교환하고 cookie 기반 Kosmo session을 생성해야 한다(MUST). Client secret은 Web BFF 또는 API 서버의 server-held configuration으로만 사용해야 한다(MUST).

#### Scenario: 유효한 browser callback 수신

- **WHEN** `/login/callback` GET 요청에 `code`와 쿠키 state와 일치하는 `state`가 포함된다
- **THEN** 시스템은 공유 application의 client ID, server-held client secret, grant type, 현재 origin의 `/login/callback` redirect URI, PKCE code verifier를 OIDC token endpoint에 제출한다
- **AND** token 응답에는 access token과 id token이 포함되어야 한다
- **AND** 시스템은 ID token signature, issuer, audience와 시간 claims가 유효하고 연결된 Account가 없거나 `ACTIVE`일 때만 Kosmo session을 생성한다

#### Scenario: 검증되지 않은 ID token 거부

- **WHEN** token endpoint가 잘못된 서명 또는 issuer, audience, 만료 claims를 가진 ID token을 반환한다
- **THEN** 시스템은 HTTP 400 오류를 반환한다
- **AND** OIDC 계정 또는 Kosmo session을 생성하지 않는다

#### Scenario: callback 입력 누락

- **WHEN** `/login/callback` 요청에 `code` 또는 `state`가 없다
- **THEN** 시스템은 HTTP 400 오류를 반환한다

#### Scenario: callback state 불일치

- **WHEN** 저장된 state 또는 code verifier 쿠키가 없거나 반환된 state가 쿠키 state와 다르다
- **THEN** 시스템은 HTTP 400 오류를 반환한다

#### Scenario: callback redirect URI 고정

- **WHEN** browser callback이 현재 origin의 `/login/callback`이 아닌 redirect URI를 제출한다
- **THEN** 시스템은 HTTP 400 오류를 반환한다
- **AND** 네이티브 redirect URI는 이 endpoint에서 처리하지 않는다

### Requirement: Native OIDC code exchange

**Authority / Provenance**: 현재 canonical `openspec/specs/session-auth/spec.md`, [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)

Kosmo API는 네이티브 앱이 Web과 공유하는 하나의 Kosmo confidential OIDC application으로 authorization code와 PKCE verifier를 Kosmo session token으로 교환할 수 있는 unauthenticated `exchangeNativeOidcSession` GraphQL mutation을 제공해야 한다(MUST). Native 앱은 client secret을 보유하거나 전송하지 않고(MUST NOT), API는 server-held client secret과 같은 shared application client ID로 code를 교환해야 한다(MUST). 새 Expo native bundle은 공개 API origin의 `/graphql`에서 이 mutation만 호출해야 한다(MUST).

#### Scenario: Exchange a valid native code

- **WHEN** 공개 API origin의 `/graphql`이 code, PKCE verifier, `kosmo://login/callback` redirect URI를 포함한 `exchangeNativeOidcSession` mutation을 받고 연결된 Account가 없거나 `ACTIVE`이다
- **THEN** API는 Web과 공유하는 confidential OIDC application의 client ID와 server-held client secret, authorization code, PKCE verifier, exact `kosmo://login/callback` redirect URI를 OIDC token endpoint에 제출한다
- **AND** API는 discovery metadata와 JWKS를 사용해 ID token signature, issuer, shared application audience, expiration, issued-at claims를 검증한다
- **AND** Kosmo는 단일 configured issuer의 `sub`를 account identity로 사용하고, 해당 issuer가 보장하는 문자열 `name` claim을 display name으로 사용한다
- **AND** API는 OIDC 계정을 upsert하고 upstream OIDC token을 저장하지 않은 ACTIVE Kosmo session을 생성한다
- **AND** mutation payload로 Kosmo session token을 반환하고 session cookie를 설정하지 않는다
- **AND** 응답에 `Cache-Control: no-store`를 설정한다

#### Scenario: Reject a native exchange for an inactive Account

- **WHEN** 검증된 native ID token의 `sub`가 기존 `SUSPENDED` 또는 Deleted Account와 연결된다
- **THEN** API는 Account 상태나 upstream OIDC 세부 정보를 노출하지 않는 generic GraphQL permission error를 반환한다
- **AND** Account를 갱신하거나 Kosmo session을 생성하지 않는다
- **AND** mutation payload와 cookie로 Kosmo session token을 반환하지 않는다

#### Scenario: Reject an invalid native redirect URI

- **WHEN** native session 요청의 redirect URI가 `kosmo://login/callback`이 아니다
- **THEN** API는 기존 GraphQL validation contract에 따른 error를 반환한다
- **AND** OIDC token endpoint를 호출하지 않는다

#### Scenario: Reject malformed native exchange input

- **WHEN** native session 요청에 code 또는 PKCE verifier가 없거나 허용 길이를 벗어난다
- **THEN** API는 기존 GraphQL validation contract에 따른 error를 반환한다
- **AND** Kosmo session을 생성하지 않는다

#### Scenario: Reject an unverifiable token response

- **WHEN** OIDC token endpoint가 잘못된 signature, issuer, audience, expiration 또는 issued-at claims를 가진 ID token을 반환한다
- **THEN** API는 upstream OIDC 오류 세부 정보와 token material을 노출하지 않는 generic GraphQL error를 반환한다
- **AND** OIDC 계정 또는 Kosmo session을 생성하지 않는다

#### Scenario: Treat an upstream OIDC outage as an internal error

- **WHEN** OIDC token endpoint가 5xx response를 반환한다
- **THEN** API는 해당 실패를 client validation error가 아닌 기존 GraphQL internal error contract로 반환한다
- **AND** production response는 upstream OIDC 오류 세부 정보와 token material을 노출하지 않는다
- **AND** OIDC 계정 또는 Kosmo session을 생성하지 않는다

#### Scenario: Reject a raw OIDC token exchange

- **WHEN** native client가 authorization code와 PKCE verifier 대신 ID token 또는 access token을 session 교환 입력으로 제출한다
- **THEN** API는 raw token field를 정의하지 않은 GraphQL input contract로 요청을 거부한다
- **AND** OIDC token endpoint를 호출하지 않고 Kosmo session을 생성하지 않는다

#### Scenario: Do not expose or persist upstream OIDC material

- **WHEN** API가 native authorization code를 OIDC token endpoint에서 교환하고 Kosmo session을 생성하거나 거부한다
- **THEN** 성공 response payload, client bundle, log, 새 Kosmo session record에 OIDC client secret, authorization code, PKCE verifier, access token 또는 ID token을 포함하지 않는다
