## MODIFIED Requirements

### Requirement: GraphQL HTTP proxy

웹 BFF는 Web cookie client의 GraphQL 요청을 API 서버로 프록시해야 한다(MUST).

#### Scenario: Proxy GraphQL POST

- **WHEN** 클라이언트가 웹 BFF의 `/graphql`에 POST 요청을 보낸다
- **THEN** 시스템은 요청 body를 API origin의 `/graphql` endpoint로 전달한다
- **AND** content-type 헤더는 원 요청의 content-type 또는 기본값 `application/json`을 사용한다
- **AND** accept 헤더가 있으면 API 요청에도 전달한다
- **AND** redirect mode는 `manual`이다
- **AND** API 응답 body와 response metadata를 클라이언트에 반환한다

#### Scenario: Forward web session cookie

- **WHEN** `/graphql` 요청에 `kosmo_session` cookie가 있고 명시적 Authorization header가 없다
- **THEN** 시스템은 API 요청에 `Authorization: Bearer <session>` 헤더를 설정한다

#### Scenario: Proxy anonymous request

- **WHEN** `/graphql` 요청에 session cookie와 Authorization header가 모두 없다
- **THEN** 시스템은 Authorization 헤더 없이 API 요청을 보낸다

#### Scenario: Reject unsupported proxy method

- **WHEN** 클라이언트가 `/graphql`에 POST 이외의 요청을 보낸다
- **THEN** 시스템은 API에 요청을 전달하지 않고 method not allowed 응답을 반환한다
