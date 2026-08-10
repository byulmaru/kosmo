## MODIFIED Requirements

### Requirement: GraphQL operation별 실행 context 격리

**Authority / Provenance**: `docs/architecture/core-services.md`, PROD-708, PROD-726.

API는 다음 계약을 MUST 준수한다. 인증에서 파생한 session identity와 operation 실행 context를 분리한다. 실행 가능한 각 GraphQL Query/Mutation operation은 다른 operation과 공유하지 않는 Pothos context cache, DataLoader registry, session snapshot과 명시적 `ctx.db` handle을 가지며, 같은 HTTP batch의 operation끼리도 이 실행 상태를 공유하지 않는다. Production에서 `ctx.db`는 operation별 PgBouncer client connection에서 파생하며, Subscription은 장기 operation DB session을 만들지 않는다.

#### Scenario: HTTP batch의 operation 격리

- **WHEN** 하나의 HTTP batch가 둘 이상의 GraphQL operation을 실행한다
- **THEN** 각 operation은 독립된 session snapshot, Pothos context cache와 DataLoader registry를 사용한다
- **AND** Query/Mutation sibling은 각각 독립된 database client connection을 사용한다
- **AND** 한 operation에서 적재하거나 변경한 실행 상태를 다른 operation이 관찰하지 않는다

#### Scenario: 기존 인증 identity 전달

- **WHEN** 인증된 request에서 GraphQL operation을 실행한다
- **THEN** operation context는 request에서 한 번 검증한 session ID, account ID와 선택적 profile ID를 유지한다
- **AND** 인증 SQL을 operation마다 재실행하지 않는다

#### Scenario: Production Query와 Mutation DB handle

- **WHEN** production GraphQL Query 또는 Mutation operation context를 만든다
- **THEN** `ctx.db`는 해당 operation에만 할당된 PgBouncer client connection을 사용한다
- **AND** operation 전체 transaction을 열지 않는다
- **AND** operation 종료 경로에서 client connection을 종료한다

#### Scenario: Subscription DB handle

- **WHEN** GraphQL Subscription operation을 시작한다
- **THEN** Query/Mutation용 장기 PgBouncer client connection을 할당하지 않는다

## ADDED Requirements

### Requirement: production GraphQL operation SQL의 DB handle 정렬

**Authority / Provenance**: `docs/architecture/core-services.md`, PROD-371, PROD-726.

Production GraphQL Query/Mutation의 root·field·loader와 이들이 호출하는 core service는 operation 실행 중 발생하는 모든 SQL에 해당 operation의 `ctx.db`를 사용해야 한다(MUST). Account, Profile, Media, Hashtag, Session, Feedback, Post와 결합 projection을 포함한 Query/Mutation call graph에는 raw 또는 global DB fallback이 없어야 한다(MUST NOT). Request 인증에서 한 번 실행하는 identity SQL과 startup/bootstrap SQL은 operation session 밖의 기존 DB 경계를 유지한다(MUST).

#### Scenario: non-Post GraphQL consumer 정렬

- **WHEN** Query 또는 Mutation이 Account, Profile, Media, Hashtag, Session 또는 Feedback DB consumer를 실행한다
- **THEN** resolver, loader와 호출된 core service의 모든 operation SQL은 `ctx.db`를 사용한다
- **AND** nested consumer가 global 또는 raw DB handle로 우회하지 않는다

#### Scenario: request 인증 SQL 예외

- **WHEN** API가 HTTP request의 session credential과 selected Profile identity를 한 번 검증한다
- **THEN** 해당 identity SQL은 operation connection을 만들기 전 기존 request DB 경계에서 실행할 수 있다
- **AND** 검증 결과만 각 operation context snapshot에 전달한다

#### Scenario: startup SQL 예외

- **WHEN** API process가 startup 또는 bootstrap용 SQL을 실행한다
- **THEN** 해당 SQL은 GraphQL operation session 밖의 기존 DB 경계를 사용할 수 있다
