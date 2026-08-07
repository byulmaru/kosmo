## ADDED Requirements

### Requirement: GraphQL operation별 실행 context 격리

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-708. API는 다음 계약을 MUST 준수한다. 인증에서 파생한 session identity와 operation 실행 context를 분리한다. 실행 가능한 각 GraphQL operation은 다른 operation과 공유하지 않는 Pothos context cache, DataLoader registry와 명시적 `ctx.db` handle을 가지며, 같은 HTTP batch의 operation끼리도 이 상태를 공유하지 않는다.

#### Scenario: HTTP batch의 operation 격리

- **WHEN** 하나의 HTTP batch가 둘 이상의 GraphQL operation을 실행한다
- **THEN** 각 operation은 독립된 Pothos context cache와 DataLoader registry를 사용한다
- **AND** 한 operation에서 적재한 loader 결과를 다른 operation이 관찰하지 않는다

#### Scenario: 기존 인증 identity 전달

- **WHEN** 인증된 request에서 GraphQL operation을 실행한다
- **THEN** operation context는 검증된 session ID, account ID와 선택적 profile ID를 유지한다
- **AND** 인증 SQL은 operation transaction으로 재실행되지 않는다

### Requirement: Query와 Mutation의 operation-scoped primary transaction

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-708. API는 다음 계약을 MUST 준수한다. parse와 validate에 성공해 실행되는 각 Query에 read-only primary transaction을, 각 Mutation에 read-write primary transaction을 연다. 해당 operation의 `ctx.db`는 그 transaction handle이며, 아직 `ctx.db`로 이전하지 않은 resolver의 전역 DB 접근과 공개 GraphQL 결과는 그대로 유지한다.

#### Scenario: Query transaction

- **WHEN** 유효한 Query operation이 실행된다
- **THEN** API는 해당 operation 전용 read-only transaction을 연다
- **AND** `ctx.db`를 사용하는 모든 resolver와 loader는 같은 transaction handle을 받는다

#### Scenario: Mutation transaction

- **WHEN** 유효한 Mutation operation이 실행된다
- **THEN** API는 해당 operation 전용 read-write transaction을 연다
- **AND** `ctx.db`를 사용하는 모든 resolver와 loader는 같은 transaction handle을 받는다

#### Scenario: Parse 또는 validation 실패

- **WHEN** GraphQL document가 parse 또는 validation 단계에서 거부된다
- **THEN** API는 operation transaction을 열거나 actor setting을 설정하지 않는다

#### Scenario: 기존 resolver 호환성

- **WHEN** 아직 전역 DB를 사용하는 기존 resolver가 실행된다
- **THEN** resolver의 SQL 경로와 GraphQL 응답은 이 기반 추가 전과 동일하게 동작한다
- **AND** 이 change는 Post/PostContent SQL, 권한 predicate, RLS policy·grant 또는 workload credential을 변경하지 않는다

### Requirement: transaction-local GraphQL actor context

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-708. API는 다음 계약을 MUST 준수한다. Query와 Mutation primary transaction 안에서 검증된 account ID와 선택적 selected profile ID를 PostgreSQL transaction-local setting으로 설정하는 공통 seam을 제공한다. 익명 또는 profile 미선택 상태는 명시적인 빈 값으로 표현하며, setting은 transaction 종료 뒤 pool connection이나 다음 operation으로 누출되지 않는다.

#### Scenario: 선택된 actor profile

- **WHEN** active account와 selected profile이 있는 operation transaction이 시작된다
- **THEN** API는 account ID와 profile ID setting을 실제 resolver SQL보다 먼저 같은 transaction에 설정한다

#### Scenario: 익명 또는 account-only actor

- **WHEN** 익명 operation 또는 selected profile이 없는 account operation이 시작된다
- **THEN** API는 존재하지 않는 actor 값을 빈 transaction-local setting으로 설정한다
- **AND** 이전 pool 사용자의 actor 값을 재사용하지 않는다

#### Scenario: pool connection 재사용

- **WHEN** actor가 다른 operation들이 같은 pool connection을 순차적으로 재사용한다
- **THEN** 각 operation은 자기 transaction-local actor setting만 관찰한다
- **AND** transaction 밖에서는 앞 operation의 actor setting이 남지 않는다

### Requirement: operation 결과와 transaction 수명 정렬

**Authority / Provenance:** PROD-708. API는 다음 계약을 MUST 준수한다. 일반 `ExecutionResult`와 transaction을 사용하는 `AsyncIterable` 결과의 소비 수명에 primary transaction 수명을 맞춘다. 정상 결과는 transaction을 종료한 뒤 반환하고, 실행 자체의 throw, iterable 오류, consumer 취소 또는 request abort는 transaction을 rollback하고 자원을 해제한다. GraphQL field error가 `ExecutionResult.errors`로 정상 반환되는 기존 부분 실행 의미를 새로운 sibling mutation atomicity 계약으로 바꾸지 않는다.

#### Scenario: 일반 실행 결과 완료

- **WHEN** Query 또는 Mutation 실행이 일반 `ExecutionResult`를 반환한다
- **THEN** API는 operation callback이 정상 완료된 transaction을 commit하고 결과를 반환한다

#### Scenario: 실행 throw

- **WHEN** GraphQL execute 함수가 결과를 반환하기 전에 throw한다
- **THEN** API는 operation transaction을 rollback하고 오류를 기존 Yoga 오류 경로로 전달한다

#### Scenario: AsyncIterable 정상 완료

- **WHEN** transaction을 사용하는 operation 실행이 `AsyncIterable`을 반환하고 consumer가 끝까지 소비한다
- **THEN** API는 마지막 결과가 소비될 때까지 transaction을 유지한 뒤 commit하고 connection을 반환한다

#### Scenario: AsyncIterable 오류 또는 취소

- **WHEN** iterable이 오류를 던지거나 consumer가 `return` 또는 `throw`로 소비를 중단한다
- **THEN** API는 operation transaction을 rollback하고 iterable 및 connection 자원을 정리한다

#### Scenario: request abort

- **WHEN** operation 실행 중 request abort signal이 발생한다
- **THEN** API는 실행을 취소하고 열린 operation transaction을 rollback한다

### Requirement: Subscription 장기 transaction 금지

**Authority / Provenance:** PROD-708. API는 다음 계약을 MUST 준수한다. Subscription operation에 Query/Mutation primary transaction을 열어 subscription stream 전체에 DB connection을 고정하지 않는다. Subscription도 독립된 Pothos/DataLoader context와 명시적 `ctx.db`를 가지며, event별 DB transaction이 필요하면 후속 resolver가 짧은 수명을 별도로 소유한다.

#### Scenario: Subscription stream 시작

- **WHEN** 유효한 Subscription operation이 장기 `AsyncIterable` stream을 반환한다
- **THEN** API는 stream 수명 전체를 감싸는 primary transaction을 열지 않는다
- **AND** 해당 operation의 context cache와 DataLoader registry는 다른 operation과 공유되지 않는다

#### Scenario: defer 비활성 유지

- **WHEN** operation execution 기반이 배포된다
- **THEN** API는 이 change만으로 `@defer` 또는 incremental delivery 기능을 활성화하지 않는다
