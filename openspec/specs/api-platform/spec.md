## Purpose

kosmo API의 GraphQL 플랫폼 계약을 문서화한다. 이 스펙은 특정 도메인 기능보다 schema 생성, Relay Node ID, 인증 scope, 오류 표현처럼 여러 API capability가 공유하는 동작을 다룬다.

## Requirements

### Requirement: API health endpoint

API 서버는 상태 확인 endpoint를 제공해야 한다(MUST).

#### Scenario: API health check

- **WHEN** 클라이언트가 API 서버의 `/health`에 GET 요청을 보낸다
- **THEN** 시스템은 JSON `{ "status": "ok" }`를 반환한다

### Requirement: GraphQL schema contract

API는 GraphQL schema에서 공통 root type, nullability, input requiredness, DateTime scalar 동작을 일관되게 제공해야 한다(MUST).

#### Scenario: Build schema

- **WHEN** GraphQL schema가 생성된다
- **THEN** 시스템은 Query와 Mutation root type을 제공한다
- **AND** 기본 field nullability는 non-null이다
- **AND** 기본 input field requiredness는 required이다

#### Scenario: Serialize DateTime

- **WHEN** API가 `DateTime` 값을 응답으로 반환한다
- **THEN** 시스템은 millisecond precision의 RFC9557 문자열로 serialize한다

#### Scenario: Parse DateTime

- **WHEN** 클라이언트가 `DateTime` input을 제공한다
- **THEN** 시스템은 문자열 값만 Temporal Instant로 parse한다
- **AND** 문자열이 아닌 값은 invalid DateTime 오류로 처리한다

#### Scenario: Emit development schema file

- **WHEN** API가 개발 환경에서 schema를 생성한다
- **THEN** 시스템은 정렬된 GraphQL schema를 `schema.graphql` 파일로 출력한다

### Requirement: Relay Node identity

API는 DB UUID를 GraphQL Node ID로 사용하고 UUID에 포함된 테이블 식별자로 Node 타입을 판별해야 한다(MUST).

#### Scenario: Return node id

- **WHEN** GraphQL Node object가 ID를 반환한다
- **THEN** 시스템은 DB UUID 문자열을 그대로 반환한다

#### Scenario: Resolve node type

- **WHEN** 클라이언트가 GraphQL Node ID를 제공한다
- **THEN** 시스템은 UUID 문자열에서 테이블 식별자를 읽고 등록된 GraphQL type name으로 해석한다
- **AND** 알 수 없는 테이블 식별자는 오류로 처리한다

#### Scenario: Batch load nodes

- **WHEN** API가 같은 Node type의 여러 ID를 resolve한다
- **THEN** 시스템은 대상 테이블의 `id` 컬럼으로 일괄 조회한다
- **AND** 조회 결과는 `id` 오름차순으로 정렬된다
- **AND** resolved object는 dataloader cache에 저장될 수 있다

### Requirement: API authentication scopes

API는 request context에서 로그인 여부와 actor profile 선택 여부를 GraphQL auth scope로 제공해야 한다(MUST).

#### Scenario: Logged-in request

- **WHEN** request context에 세션이 존재한다
- **THEN** `login` auth scope는 참이다

#### Scenario: Anonymous request

- **WHEN** request context에 세션이 없다
- **THEN** `login` auth scope는 거짓이다

#### Scenario: Request using profile

- **WHEN** request context에 세션과 actor profile ID가 존재한다
- **THEN** `usingProfile` auth scope는 참이다

#### Scenario: Request without actor profile

- **WHEN** request context에 세션이 없거나 actor profile ID가 없다
- **THEN** `usingProfile` auth scope는 거짓이다

### Requirement: API error representation

API는 클라이언트가 분기할 수 있는 도메인 오류를 GraphQL error object와 field result union으로 노출해야 한다(MUST).

#### Scenario: Common error fields

- **WHEN** GraphQL 오류 객체가 반환된다
- **THEN** 객체는 `message`와 `code` 필드를 포함하는 `Error` interface를 구현한다

#### Scenario: Field-specific error

- **WHEN** validation 또는 conflict 오류가 반환된다
- **THEN** 객체는 nullable `field`를 포함하는 `FieldError` interface를 구현한다

#### Scenario: Forbidden error

- **WHEN** permission denied 오류가 반환된다
- **THEN** 객체는 `ForbiddenError` interface를 구현한다

#### Scenario: Input validation failure

- **WHEN** input validation이 실패한다
- **THEN** 시스템은 첫 번째 validation issue의 message를 사용하는 `ValidationError`를 반환한다
- **AND** validation issue path의 `input` prefix는 오류 field에서 제외된다

### Requirement: GraphQL enum registration

API는 GraphQL schema에서 노출되는 core enum을 schema 생성 전에 등록해야 한다(MUST).

#### Scenario: Build enum schema

- **WHEN** GraphQL schema가 생성된다
- **THEN** 시스템은 현재 API가 노출하는 core enum을 GraphQL enum으로 등록한다
- **AND** 현재 등록 대상은 `AccountState`, `AccountProfileRole`, `ProfileFollowPolicy`, `ProfileFollowState`, `ProfileState`이다
