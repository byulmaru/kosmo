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

#### Scenario: Mutation payload naming

- **WHEN** mutation이 별도 payload object를 반환한다
- **THEN** payload type name은 `<MutationName>Payload` 형식을 사용한다

### Requirement: Relay Node identity

API는 concrete GraphQL typename과 DB UUID를 포함하는 opaque global ID를 GraphQL Node ID로 사용하고, global ID의 concrete typename으로 Node loader를 선택해야 한다(MUST).

#### Scenario: Return node id

- **WHEN** concrete GraphQL Node object가 ID를 반환한다
- **THEN** 시스템은 concrete GraphQL typename과 underlying DB UUID를 포함하는 opaque global ID를 반환한다
- **AND** DB UUID 문자열을 GraphQL Node ID로 그대로 노출하지 않는다
- **AND** encode 전 payload는 DB UUID의 raw 16바이트 뒤에 concrete GraphQL typename의 ASCII bytes를 구분자 없이 배치한다
- **AND** global ID는 padding 없는 base64url 문자열로 URL path segment에 추가 escaping 없이 사용할 수 있다

#### Scenario: Resolve node type

- **WHEN** 클라이언트가 유효한 GraphQL Node global ID를 제공한다
- **THEN** 시스템은 global ID에서 concrete GraphQL typename과 DB UUID를 decode한다
- **AND** concrete typename에 등록된 Node loader를 DB UUID로 호출한다
- **AND** UUID version이나 table discriminator로 GraphQL type을 추론하지 않는다

#### Scenario: Reject legacy raw UUID node id

- **WHEN** 클라이언트가 raw DB UUID를 GraphQL Node ID로 제공한다
- **THEN** 시스템은 compatibility fallback 없이 invalid global ID로 처리한다

#### Scenario: Reject invalid or unsupported typename

- **WHEN** 클라이언트가 문법적으로 잘못된 global ID, 알 수 없는 typename 또는 loadable concrete Node가 아닌 typename을 제공한다
- **THEN** 시스템은 해당 ID를 유효한 Node로 resolve하지 않는다
- **AND** interface typename을 concrete loader 대신 사용하지 않는다

#### Scenario: Do not trust mismatched typename

- **WHEN** global ID의 typename에 등록된 loader가 underlying DB UUID에 해당하는 조회 가능한 row를 찾지 못한다
- **THEN** 시스템은 다른 table이나 type을 추론해 재시도하지 않는다
- **AND** 해당 ID는 object 없음으로 처리한다

#### Scenario: Batch load nodes

- **WHEN** API가 같은 concrete Node type의 여러 global ID를 resolve한다
- **THEN** 시스템은 decode된 DB UUID를 대상 테이블의 `id` 컬럼으로 일괄 조회한다
- **AND** 조회 결과와 object 없음 결과는 요청된 ID 순서에 맞춰 반환된다
- **AND** resolved object는 dataloader cache에 저장될 수 있다

#### Scenario: Context-aware node loading

- **WHEN** API가 global ID를 Node object로 load한다
- **THEN** 시스템은 해당 concrete object type의 조회 가능성 규칙을 load 단계에서 적용할 수 있다
- **AND** 조회할 수 없는 DB UUID는 object 없음으로 처리한다

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

API는 클라이언트가 분기할 수 있는 도메인 오류를 GraphQL `errors[]` entry로 노출해야 한다(MUST).

#### Scenario: Common domain error fields

- **WHEN** domain error가 GraphQL 응답으로 반환된다
- **THEN** error entry는 domain error의 `message`를 사용한다
- **AND** `extensions.code`는 domain error code를 포함한다

#### Scenario: Field-specific error

- **WHEN** validation 또는 conflict 오류가 특정 input field에 속한다
- **THEN** error entry의 `extensions.field`는 해당 field path를 포함한다

#### Scenario: Auth scope error

- **WHEN** GraphQL auth scope 검증이 실패한다
- **THEN** error entry는 Kosmo permission error로 반환된다
- **AND** `extensions.code`는 `PERMISSION_DENIED`이다

#### Scenario: Unexpected error masking

- **WHEN** 예상 밖 서버 오류가 production GraphQL 응답으로 반환된다
- **THEN** 시스템은 내부 오류 message를 노출하지 않는다
- **AND** `extensions.code`는 `INTERNAL_SERVER_ERROR`이다

#### Scenario: Input validation failure

- **WHEN** input validation이 실패한다
- **THEN** error entry는 첫 번째 validation issue의 message를 사용한다
- **AND** validation issue path의 `input` prefix는 `extensions.field`에서 제외된다

### Requirement: GraphQL enum registration

API는 GraphQL schema에서 노출되는 core enum을 schema 생성 전에 등록해야 한다(MUST).

#### Scenario: Build enum schema

- **WHEN** GraphQL schema가 생성된다
- **THEN** 시스템은 현재 API가 노출하는 core enum을 GraphQL enum으로 등록한다
- **AND** 현재 등록 대상은 `AccountState`, `AccountProfileRole`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `ProfileState`이다

### Requirement: ProfileFollowRequest Relay Node contract

API는 pending follow request를 participant에게만 노출되는 Relay Node로 제공해야 한다(MUST).

#### Scenario: Read request Node as participant

- **WHEN** 현재 active profile이 follower 또는 followee인 인증자가 `ProfileFollowRequest` global ID를 조회한다
- **THEN** 시스템은 해당 pending `ProfileFollowRequest` Node를 반환한다
- **AND** Node의 follower와 followee 필드는 각 Profile이 viewer에게 노출 가능한 경우 반환한다

#### Scenario: Hide request Node from non-participant

- **WHEN** 현재 active profile이 request participant가 아닌 인증자 또는 active profile이 없는 viewer가 request global ID를 조회한다
- **THEN** 시스템은 Node를 `null`로 반환한다
- **AND** request 존재 여부를 오류나 다른 필드로 노출하지 않는다

#### Scenario: Read request Node for cleanup with unavailable participant

- **WHEN** 현재 active profile이 request participant이고 다른 participant가 비활성 상태이거나 remote instance가 `SUSPENDED`인 request global ID를 조회한다
- **THEN** 시스템은 해당 pending `ProfileFollowRequest` Node를 반환한다
- **AND** unavailable participant의 Profile 필드는 해당 Profile의 visibility 계약에 따라 `null`일 수 있다

### Requirement: Follow profile success union contract

API는 follow 요청 성공 결과가 성립된 관계인지 pending 요청인지 GraphQL union으로 구분해야 한다(MUST).

#### Scenario: Return established follow result

- **WHEN** `followProfile`이 새 관계를 생성하거나 기존 관계를 반환한다
- **THEN** `FollowProfilePayload.result`는 `ProfileFollowResult` union의 `ProfileFollow` concrete type이다
- **AND** payload는 cache 갱신에 필요한 follower와 followee Profile을 포함한다

#### Scenario: Return pending request result

- **WHEN** `followProfile`이 새 pending request를 생성하거나 기존 request를 반환한다
- **THEN** `FollowProfilePayload.result`는 `ProfileFollowResult` union의 `ProfileFollowRequest` concrete type이다
- **AND** payload는 cache 갱신에 필요한 follower와 followee Profile을 포함한다

### Requirement: Follow request transition payload contract

API는 request 승인·거절·취소 결과가 Relay cache에서 삭제된 request를 제거하고, 승인으로 변경된 관계와 Profile을 갱신할 수 있는 payload를 반환해야 한다(MUST).

#### Scenario: Return approval payload

- **WHEN** follow request 승인이 성공한다
- **THEN** payload는 생성되거나 기존에 있던 `ProfileFollow`를 반환한다
- **AND** 삭제된 `ProfileFollowRequest` global ID를 반환한다
- **AND** follower와 followee Profile을 반환한다

#### Scenario: Return rejection payload

- **WHEN** follow request 거절이 성공한다
- **THEN** payload는 삭제된 `ProfileFollowRequest` global ID를 반환한다
- **AND** 행동자인 non-null `followeeProfile`을 반환한다
- **AND** unavailable일 수 있는 follower Profile은 payload에 포함하지 않는다
- **AND** 삭제된 `ProfileFollowRequest` Node 자체를 반환하지 않는다

#### Scenario: Return cancellation payload

- **WHEN** follow request 취소가 성공한다
- **THEN** payload는 삭제된 `ProfileFollowRequest` global ID를 반환한다
- **AND** 행동자인 non-null `followerProfile`을 반환한다
- **AND** unavailable일 수 있는 followee Profile은 payload에 포함하지 않는다
- **AND** 삭제된 `ProfileFollowRequest` Node 자체를 반환하지 않는다

#### Scenario: Identify the actor connection edge to remove

- **WHEN** follow request 거절 또는 취소가 성공한다
- **THEN** payload의 actor Profile은 갱신할 incoming 또는 outgoing request connection의 소유자를 식별한다
- **AND** payload의 삭제된 `ProfileFollowRequest` global ID는 해당 connection edge를 제거할 수 있게 한다
