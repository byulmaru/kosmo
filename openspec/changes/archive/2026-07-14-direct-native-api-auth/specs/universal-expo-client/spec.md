## MODIFIED Requirements

### Requirement: Cross-platform GraphQL transport

Relay network layer는 웹에서는 same-origin BFF를, Android/iOS에서는 공개 API origin을 사용해 GraphQL 요청을 보내야 한다(MUST).

#### Scenario: Send a web operation

- **WHEN** Web 클라이언트가 GraphQL operation을 실행한다
- **THEN** Relay network는 현재 origin의 `/graphql`에 credential 포함 POST 요청을 보낸다
- **AND** browser script는 HttpOnly session cookie 값을 읽지 않는다

#### Scenario: Send a native operation

- **WHEN** Android 또는 iOS 클라이언트가 GraphQL operation을 실행하고 SecureStore에 현재 configured API origin 및 native OIDC issuer/client 설정과 일치하는 session token envelope이 있다
- **THEN** Relay network는 설정된 API origin의 `/graphql`에 `Authorization: Bearer <session>` 헤더를 포함한 POST 요청을 보낸다
- **AND** native request는 browser cookie credential에 의존하지 않는다

#### Scenario: Discard an invalid native session envelope

- **WHEN** SecureStore session envelope이 malformed이거나 API origin, native OIDC issuer 또는 native client ID가 현재 설정과 다르다
- **THEN** client는 저장 값을 삭제하고 session token을 복원하지 않는다
- **AND** 저장된 token을 현재 API origin의 `/graphql`로 전송하지 않는다

#### Scenario: Validate the native API origin

- **WHEN** native client가 configured API origin을 해석한다
- **THEN** origin은 credential, path, query, hash가 없는 HTTP(S) origin이어야 한다
- **AND** loopback 외 HTTP origin은 명시적 development override가 없으면 거부한다

#### Scenario: Send an anonymous operation

- **WHEN** session cookie 또는 native session token이 없는 클라이언트가 공개 query를 실행한다
- **THEN** Web 클라이언트는 same-origin BFF에 Authorization 없이 요청한다
- **AND** Android 또는 iOS 클라이언트는 API origin에 Authorization 없이 요청한다
- **AND** 공개 profile/post data를 받을 수 있다
