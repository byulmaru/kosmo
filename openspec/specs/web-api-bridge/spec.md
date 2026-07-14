## Purpose

Web cookie client가 사용하는 kosmo BFF/API bridge 계약을 문서화한다. GraphQL proxy, cookie credential forwarding과 React Relay transport·compiler 경계를 다룬다.

## Requirements

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

### Requirement: Web GraphQL client transport

웹 클라이언트는 React Relay network layer로 웹 BFF의 `/graphql` proxy endpoint를 사용해야 한다(MUST).

#### Scenario: Create web Relay environment

- **WHEN** Web 클라이언트가 Relay environment를 생성한다
- **THEN** 시스템은 Relay Network와 Store/RecordSource를 구성한다
- **AND** Network fetch 함수는 `/graphql`에 credential을 포함한 JSON POST를 보낸다
- **AND** GraphQL `errors[]`가 있으면 Relay가 처리할 수 있는 응답으로 유지한다

#### Scenario: Reset actor-scoped cache

- **WHEN** `selectProfile` mutation으로 현재 session의 active profile이 바뀐다
- **THEN** 클라이언트는 actor profile에 의존하는 Relay environment/store를 교체하거나 무효화한다
- **AND** 새 active profile 기준의 home timeline과 viewer-relative field를 network에서 다시 조회한다

### Requirement: Relay compiler contract

클라이언트 build는 API schema와 colocated GraphQL document를 Relay Compiler로 검증하고 생성 artifact를 build input으로 사용해야 한다(MUST).

#### Scenario: Generate Relay artifacts

- **WHEN** 개발자 또는 CI가 Relay compile 명령을 실행한다
- **THEN** compiler는 `apps/api/schema.graphql`을 읽고 `apps/app` source의 GraphQL document를 처리한다
- **AND** TypeScript language target으로 generated artifact를 출력한다

#### Scenario: Fail on schema drift

- **WHEN** client document가 현재 schema에 없는 field, type 또는 잘못된 argument를 사용한다
- **THEN** Relay compile 또는 artifact verification이 실패한다

### Requirement: Relay connection pagination

팔로워와 팔로잉 목록은 Relay connection directive와 pagination fragment를 사용해 다음 page를 병합해야 한다(MUST).

#### Scenario: Load next connection page

- **WHEN** 사용자가 followers 또는 following 목록에서 다음 page를 요청하고 `pageInfo.hasNextPage`가 true이다
- **THEN** 클라이언트는 generated pagination query로 `after` cursor를 전송한다
- **AND** Relay store는 새 edge를 기존 connection에 중복 없이 추가한다
