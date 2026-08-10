## MODIFIED Requirements

### Requirement: GraphQL operation별 실행 context 격리

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-708. API는 다음 계약을 MUST 준수한다. 인증에서 파생한 session identity와 operation 실행 context를 분리한다. 실행 가능한 각 GraphQL operation은 다른 operation과 공유하지 않는 Pothos context cache, DataLoader registry, session snapshot과 명시적 `ctx.db` handle을 가지며, 같은 HTTP batch의 operation끼리도 이 실행 상태를 공유하지 않는다. PROD-708에서 `ctx.db`는 기존 global DB handle을 가리키는 additive seam이며 새 connection이나 transaction을 열지 않는다.

#### Scenario: HTTP batch의 operation 격리

- **WHEN** 하나의 HTTP batch가 둘 이상의 GraphQL operation을 실행한다
- **THEN** 각 operation은 독립된 session snapshot, Pothos context cache와 DataLoader registry를 사용한다
- **AND** 한 operation에서 적재하거나 변경한 실행 상태를 다른 operation이 관찰하지 않는다

#### Scenario: 기존 인증 identity 전달

- **WHEN** 인증된 request에서 GraphQL operation을 실행한다
- **THEN** operation context는 request에서 한 번 검증한 session ID, account ID와 선택적 profile ID를 유지한다
- **AND** 인증 SQL을 operation마다 재실행하지 않는다

#### Scenario: Additive DB handle

- **WHEN** PROD-708의 production GraphQL operation context를 만든다
- **THEN** `ctx.db`는 기존 global DB handle을 기본값으로 사용한다
- **AND** operation 전용 connection이나 operation-wide transaction을 열지 않는다
- **AND** 기존 resolver SQL과 GraphQL 응답은 변경 전과 동일하게 동작한다

## REMOVED Requirements

### Requirement: Query와 Mutation의 operation-scoped primary transaction

**Reason**: RLS actor context를 operation-wide transaction이 아니라 PgBouncer client session 수명에 유지하기로 정정했으며, dormant transaction seam은 현재와 후속 구조 모두에 불필요하다.

**Migration**: PROD-728이 session pool을 배포하고 PROD-726이 모든 DB consumer 정렬 뒤 operation별 client session을 활성화한다.

### Requirement: transaction-local GraphQL actor context

**Reason**: actor context는 transaction-local setting이 아니라 operation 전용 PgBouncer client session의 session-level setting으로 전환한다.

**Migration**: actor GUC 설정, fail-closed 값과 client 종료 뒤 reset 검증은 PROD-726과 PROD-728이 소유한다.

### Requirement: operation 결과와 transaction 수명 정렬

**Reason**: operation-wide transaction을 제거하므로 ExecutionResult/AsyncIterable과 transaction 수명을 연결하는 custom bridge가 필요하지 않다.

**Migration**: PROD-726은 일반 Query/Mutation operation의 client connection을 완료·오류·abort에 닫고 Subscription stream 전체에는 장기 session을 열지 않는다.

### Requirement: Subscription 장기 transaction 금지

**Reason**: PROD-708은 operation transaction이나 connection lifecycle을 전혀 활성화하지 않으므로 Subscription 전용 transaction 계약을 소유하지 않는다.

**Migration**: Subscription event별 짧은 DB session 경계가 필요하면 실제 Subscription consumer를 이전하는 후속 이슈가 정의한다.
