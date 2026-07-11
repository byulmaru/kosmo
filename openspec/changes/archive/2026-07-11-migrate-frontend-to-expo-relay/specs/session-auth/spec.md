## ADDED Requirements

### Requirement: Native OIDC code exchange

웹 BFF는 네이티브 공개 클라이언트가 직접 client secret을 보유하지 않도록 authorization code와 PKCE verifier를 Kosmo session token으로 교환하는 endpoint를 제공해야 한다(MUST).

#### Scenario: Exchange a valid native code

- **WHEN** `/login/native/session`이 code, PKCE verifier, `kosmo://login/callback` redirect URI를 포함한 POST 요청을 받는다
- **THEN** 서버는 server-side OIDC client secret과 함께 token endpoint에 authorization code를 제출한다
- **AND** 서버는 discovery metadata와 JWKS를 사용해 ID token signature, issuer, audience와 시간 claims를 검증한다
- **AND** OIDC 계정을 upsert하고 ACTIVE Kosmo session을 생성한다
- **AND** 응답 body로 Kosmo session token을 반환한다
- **AND** 응답에 session cookie를 설정하지 않는다

#### Scenario: Reject an invalid native redirect URI

- **WHEN** native session 요청의 redirect URI가 `kosmo://login/callback`이 아니다
- **THEN** 서버는 HTTP 400을 반환한다
- **AND** OIDC token endpoint를 호출하지 않는다

#### Scenario: Reject malformed native exchange input

- **WHEN** native session 요청에 code 또는 PKCE verifier가 없거나 허용 길이를 벗어난다
- **THEN** 서버는 HTTP 400을 반환한다
- **AND** Kosmo session을 생성하지 않는다

#### Scenario: Do not expose the OIDC client secret

- **WHEN** native session 교환이 성공하거나 실패한다
- **THEN** 응답, client bundle, log에 OIDC client secret을 포함하지 않는다

## MODIFIED Requirements

### Requirement: OIDC PKCE 로그인 시작

웹 애플리케이션은 `/login` 요청에서 browser용 OIDC authorization code with PKCE 로그인을 시작해야 한다(MUST). 네이티브 앱은 이 endpoint의 user-agent 분기를 사용하지 않고 자체 AuthSession 흐름을 사용한다.

#### Scenario: 브라우저 로그인 시작

- **WHEN** 사용자가 웹에서 `/login`에 GET 요청을 보낸다
- **THEN** 시스템은 10분 동안 유효한 HTTP-only `kosmo_oidc_state` 쿠키와 `kosmo_oidc_code_verifier` 쿠키를 `/login/callback` 경로에 설정한다
- **AND** 시스템은 `response_type=code`, 공개 OIDC client id, 현재 origin의 `/login/callback` redirect URI, `openid profile` scope, S256 code challenge, state를 포함하여 OIDC authorize URL로 리다이렉트한다

### Requirement: OIDC callback 처리

웹 애플리케이션은 `/login/callback`에서 browser login code를 교환하고 cookie 기반 Kosmo session을 생성해야 한다(MUST). 네이티브 code는 전용 `/login/native/session` endpoint에서 처리해야 한다(MUST).

#### Scenario: 유효한 browser callback 수신

- **WHEN** `/login/callback` GET 요청에 `code`와 쿠키 state와 일치하는 `state`가 포함된다
- **THEN** 시스템은 OIDC token endpoint에 authorization code, PKCE code verifier, client id, client secret, grant type, 현재 origin의 `/login/callback` redirect URI를 제출한다
- **AND** token 응답에는 access token과 id token이 포함되어야 한다
- **AND** 시스템은 ID token signature, issuer, audience와 시간 claims가 유효할 때만 Kosmo session을 생성한다

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
