## Purpose

브라우저에서 실행되는 kosmo 웹 클라이언트와 API 서버 사이의 bridge 계약을 문서화한다. 이 스펙은 GraphQL proxy, session cookie forwarding, 웹 GraphQL client transport를 다룬다.

## Requirements

### Requirement: GraphQL HTTP proxy

웹 애플리케이션은 브라우저의 GraphQL 요청을 API 서버로 프록시해야 한다(MUST).

#### Scenario: Proxy GraphQL POST

- **WHEN** 클라이언트가 웹 애플리케이션의 `/graphql`에 POST 요청을 보낸다
- **THEN** 시스템은 요청 body를 API origin의 `/graphql` endpoint로 전달한다
- **AND** content-type 헤더는 원 요청의 content-type 또는 기본값 `application/json`을 사용한다
- **AND** accept 헤더가 있으면 API 요청에도 전달한다
- **AND** redirect mode는 `manual`이다
- **AND** API 응답 body와 response metadata를 클라이언트에 반환한다

#### Scenario: Forward session cookie

- **WHEN** 웹 `/graphql` 요청에 `kosmo_session` 쿠키가 있다
- **THEN** 시스템은 API 요청에 `Authorization: Bearer <session>` 헤더를 설정한다

#### Scenario: Proxy anonymous request

- **WHEN** 웹 `/graphql` 요청에 `kosmo_session` 쿠키가 없다
- **THEN** 시스템은 Authorization 헤더 없이 API 요청을 보낸다

### Requirement: Web GraphQL client transport

웹 클라이언트는 웹 애플리케이션의 `/graphql` proxy endpoint를 GraphQL transport로 사용해야 한다(MUST).

#### Scenario: Create web GraphQL client

- **WHEN** Svelte GraphQL client가 생성된다
- **THEN** 시스템은 dedup exchange, cache exchange, HTTP exchange를 사용한다
- **AND** HTTP exchange URL은 `/graphql`이다
