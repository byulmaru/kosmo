## Purpose

웹 로그인, OIDC callback, kosmo 세션 쿠키 발급, API request context 파생의 현재 인증 동작을 기준선으로 문서화한다.

## Requirements

### Requirement: OIDC PKCE 로그인 시작

웹 애플리케이션은 `/login` 요청에서 OIDC authorization code with PKCE 로그인을 시작해야 한다(MUST).

#### Scenario: 브라우저 로그인 시작

- **WHEN** 사용자가 웹에서 `/login`에 GET 요청을 보낸다
- **THEN** 시스템은 10분 동안 유효한 HTTP-only `kosmo_oidc_state` 쿠키와 `kosmo_oidc_code_verifier` 쿠키를 `/login/callback` 경로에 설정한다
- **AND** 시스템은 `response_type=code`, 공개 OIDC client id, 현재 origin의 `/login/callback` redirect URI, `openid profile` scope, S256 code challenge, state를 포함하여 OIDC authorize URL로 리다이렉트한다

#### Scenario: 네이티브 앱 로그인 시작

- **WHEN** `/login` 요청의 user-agent에 `KosmoApp/`이 포함된다
- **THEN** 시스템은 OIDC authorize URL 대신 `/login/native`로 리다이렉트한다
- **AND** 리다이렉트 URL은 code challenge와 state를 query parameter로 포함한다

### Requirement: OIDC callback 처리

웹 애플리케이션은 `/login/callback`에서 OIDC code를 교환하고 kosmo 세션을 생성해야 한다(MUST).

#### Scenario: 유효한 callback 수신

- **WHEN** `/login/callback` GET 요청에 `code`와 쿠키 state와 일치하는 `state`가 포함된다
- **THEN** 시스템은 OIDC token endpoint에 authorization code, PKCE code verifier, client id, client secret, grant type, redirect URI를 제출한다
- **AND** token 응답에는 access token과 id token이 포함되어야 한다

#### Scenario: callback 입력 누락

- **WHEN** `/login/callback` 요청에 `code` 또는 `state`가 없다
- **THEN** 시스템은 HTTP 400 오류를 반환한다

#### Scenario: callback state 불일치

- **WHEN** 저장된 state 또는 code verifier 쿠키가 없거나 반환된 state가 쿠키 state와 다르다
- **THEN** 시스템은 HTTP 400 오류를 반환한다

#### Scenario: callback redirect URI 검증

- **WHEN** callback 요청이 `redirect_uri`를 포함한다
- **THEN** 시스템은 redirect URI가 현재 origin의 `/login/callback` 또는 `kosmo://login/callback`인 경우에만 허용한다
- **AND** 그 외 redirect URI는 HTTP 400 오류를 반환한다

### Requirement: OIDC 계정 upsert와 세션 쿠키

웹 애플리케이션은 OIDC id token의 subject를 기준으로 계정을 upsert하고 kosmo 세션 쿠키를 발급해야 한다(MUST).

#### Scenario: 로그인 성공

- **WHEN** OIDC token 응답의 id token payload가 문자열 `sub`와 `name`을 포함한다
- **THEN** 시스템은 `sub`를 `account.oidc_subject`로 사용하여 계정을 생성하거나 기존 계정의 표시 이름을 갱신한다
- **AND** 계정 상태는 신규 생성 시 `ACTIVE`이다
- **AND** 시스템은 무작위 session token을 가진 `ACTIVE` 세션을 생성한다
- **AND** 시스템은 `kosmo_oidc_state`와 `kosmo_oidc_code_verifier` 쿠키를 삭제한다
- **AND** 시스템은 1년 동안 유효한 HTTP-only `kosmo_session` 쿠키를 `/` 경로에 설정한다
- **AND** 시스템은 `/`로 리다이렉트한다

#### Scenario: id token payload invalid

- **WHEN** id token이 디코딩되지 않거나 payload가 `sub`와 `name`을 포함하지 않는다
- **THEN** 시스템은 HTTP 400 오류를 반환한다

### Requirement: API 세션 컨텍스트 파생

API 서버는 Bearer token에서 현재 세션과 세션에 저장된 actor profile을 파생해야 한다(MUST).

#### Scenario: 유효한 Bearer token

- **WHEN** API 요청의 `Authorization` 헤더가 `Bearer <token>` 형식이고 token이 활성 세션과 일치한다
- **THEN** 시스템은 세션 ID, 계정 ID, 선택적 actor profile ID를 request context에 설정한다
- **AND** 연결된 계정은 `ACTIVE` 상태여야 한다
- **AND** 세션은 `ACTIVE` 상태여야 한다

#### Scenario: actor profile 선택

- **WHEN** 유효한 세션의 `active_profile_id`가 존재한다
- **THEN** 시스템은 해당 프로필이 활성 상태이고 세션 계정과 `account_profile`로 연결된 경우에만 actor profile로 사용한다
- **AND** 유효하지 않은 actor profile은 `null`로 처리한다

#### Scenario: actor profile 없음

- **WHEN** 유효한 세션의 `active_profile_id`가 없다
- **THEN** 시스템은 actor profile을 `null`로 처리한다
