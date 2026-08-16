## ADDED Requirements

### Requirement: GraphQL request별 단일 operation 실행 context

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, PROD-776, PROD-779 — API는 MUST HTTP request마다 하나의 GraphQL operation만 실행하고, request 인증에서 검증한 session identity와 request-scoped DataLoader context를 해당 operation에 직접 제공한다. API는 JSON array batching 또는 별도의 operation context snapshot을 지원해서는 안 되며(MUST NOT), context는 DB handle을 소유하거나 노출해서도 안 된다(MUST NOT).

#### Scenario: 인증된 단일 operation request

- **WHEN** 인증된 HTTP request가 하나의 GraphQL operation을 실행한다
- **THEN** operation은 request에서 검증한 session ID, account ID와 선택적 profile ID를 직접 사용한다
- **AND** request-scoped DataLoader context를 사용한다
- **AND** operation별 context clone이나 PostgreSQL database owner를 생성하지 않는다

#### Scenario: JSON array batch를 실행하지 않음

- **WHEN** GraphQL HTTP endpoint가 JSON array request body를 받는다
- **THEN** API는 이를 여러 operation의 batch로 실행하지 않는다
- **AND** 어떤 batch sibling 실행 상태도 생성하거나 공유하지 않는다

#### Scenario: 같은 Mutation의 selected Profile 전환

- **WHEN** 하나의 Mutation에서 `selectProfile` top-level field가 selected Profile 전환에 성공한다
- **THEN** request context의 profile ID는 새 selected Profile로 갱신된다
- **AND** 같은 Mutation에서 이후 직렬 실행되는 top-level field는 새 selected Profile identity를 관찰한다
- **AND** 다음 HTTP request는 저장된 selected Profile을 인증 경계에서 다시 검증한다

### Requirement: GraphQL application SQL의 shared DB access 경계

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, PROD-776, PROD-779 — GraphQL application SQL은 MUST 표준 `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`로 구성한 process shared DB access 경계를 사용한다. API는 GraphQL operation별 database client, actor GUC 또는 `OPERATION_DATABASE_URL`에 의존해서는 안 된다(MUST NOT). 이 전환은 기존 application visibility/owner policy, GraphQL schema·payload·목록 후보·정렬·pagination과 domain transaction·savepoint·post-commit 의미를 변경해서는 안 된다(MUST NOT).

#### Scenario: GraphQL 조회가 shared DB를 사용한다

- **WHEN** GraphQL operation이 Node, list, field 또는 loader 조회를 실행한다
- **THEN** SQL은 process shared DB access 경계에서 실행된다
- **AND** operation별 database client나 actor setting을 만들지 않는다
- **AND** 해당 object의 기존 application visibility 또는 owner predicate를 적용한다

#### Scenario: GraphQL 변경이 shared DB를 사용한다

- **WHEN** GraphQL mutation이 entry-local write 또는 core application action을 실행한다
- **THEN** resolver는 process shared DB access 경계에서 기존 transaction 또는 savepoint를 시작하거나 action을 호출한다
- **AND** 기존 payload와 awaited post-commit 결과를 유지한다
- **AND** operation-wide transaction을 만들지 않는다

#### Scenario: RLS 철회 전환의 관찰 가능한 계약을 보존한다

- **WHEN** GraphQL operation DB session과 actor GUC/session state를 제거한 revision을 검증한다
- **THEN** hidden/deleted Post owner cleanup과 기존 mutation payload가 유지된다
- **AND** Notification cleanup과 viewer-independent Reaction count가 유지된다
- **AND** Bookmark의 selected Profile owner 조건과 hidden/deleted Target Post projection 계약이 유지된다

#### Scenario: 다른 runtime lifecycle을 유지한다

- **WHEN** API GraphQL shared DB 전환을 렌더하고 검증한다
- **THEN** Worker, Fedify와 Temporal의 DB lifecycle 및 policy는 변경되지 않는다
- **AND** migration owner와 Fedify queue의 별도 database/role 경계는 유지된다
- **AND** 기존 PgBouncer Pooler 리소스는 유지되지만 GraphQL application traffic은 이를 사용하지 않는다

## REMOVED Requirements

### Requirement: GraphQL operation별 실행 context 격리

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, PROD-776, PROD-779 — This historical HTTP batch sibling isolation requirement MUST be removed from the active capability.

**Reason**: Kosmo client는 request마다 하나의 operation을 보내며, 사용하지 않는 JSON array batching을 위해 session snapshot, Pothos cache와 DataLoader registry를 operation별로 복제할 필요가 없다. Batching만 남기고 clone을 제거하면 동시 sibling이 mutable identity와 loader state를 공유해 실행 결과가 비결정적이 된다.

**Migration**: JSON array batching과 `createOperationContext`를 함께 제거하고, 단일 operation이 인증된 request context를 직접 사용하도록 한다. 같은 Mutation의 `selectProfile` 성공은 request context를 갱신하고 다음 request는 저장된 선택을 다시 인증한다.

#### Scenario: Operation 격리 requirement가 제거됨

- **WHEN** 이 delta가 canonical API capability에 동기화된다
- **THEN** HTTP batch sibling별 session snapshot, Pothos cache와 DataLoader registry를 복제해야 한다는 requirement는 더 이상 active contract가 아니다

### Requirement: Post API SQL의 operation DB handle 정렬

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, PROD-776, PROD-779 — This historical operation DB handle requirement MUST be removed from the active capability.

**Reason**: GraphQL 요청별 권한을 PostgreSQL session actor state로 계산하지 않으므로 Post call graph가 operation별 `ctx.db`를 전달할 이유가 없다.

**Migration**: Post 및 결합 Bookmark/Reaction/Notification 경로는 process shared DB access 경계를 사용하고 기존 application policy와 transaction/post-commit 계약을 유지한다.

#### Scenario: Post operation DB handle requirement가 제거됨

- **WHEN** 이 delta가 canonical API capability에 동기화된다
- **THEN** Post call graph가 `ctx.db`를 전달해야 한다는 requirement는 더 이상 active contract가 아니다

### Requirement: Post API handle 전환의 행동 호환성

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, PROD-776, PROD-779 — This historical handle-transition requirement MUST be removed from the active capability.

**Reason**: `ctx.db` additive seam과 후속 RLS activation을 전제로 한 전환 단계가 ADR 0024로 supersede되었다.

**Migration**: 위의 shared DB access 요구사항이 Post 행동 호환성, application policy와 transaction 경계를 직접 소유한다.

#### Scenario: Post handle transition requirement가 제거됨

- **WHEN** 이 delta가 canonical API capability에 동기화된다
- **THEN** additive `ctx.db` seam과 후속 RLS activation을 전제로 한 compatibility requirement는 더 이상 active contract가 아니다
