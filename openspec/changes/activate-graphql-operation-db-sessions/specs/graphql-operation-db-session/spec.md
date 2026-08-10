## ADDED Requirements

### Requirement: Query와 Mutation마다 독립된 database client session을 사용한다

**Authority / Provenance**: `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`, Linear PROD-726.

Production GraphQL API는 실행 가능한 각 Query와 Mutation operation마다 `OPERATION_DATABASE_URL` Pooler endpoint에 대한 실제 client connection을 하나 생성해야 한다(MUST). 해당 operation의 user-data resolver, result projection, loader와 호출하는 core domain action SQL은 모두 같은 connection에서 파생한 `ctx.db`를 사용해야 하며(MUST), Mutation nested result resolver도 같은 handle을 사용해야 한다(MUST). application이 operation 사이에 client connection을 재사용해서는 안 된다(MUST NOT). 기존 domain transaction은 이 connection 안에서 유지해야 하지만(MUST), operation 전체를 감싸는 transaction을 열어서는 안 된다(MUST NOT). API request authentication과 startup/bootstrap SQL은 `DATABASE_URL` direct 경계를 유지하며, Fedify-owned remote actor materialization trusted side effect는 이 operation session의 direct exception이다. materialization 뒤 최종 GraphQL query/result projection은 `ctx.db`를 사용해야 한다(MUST).

#### Scenario: Query가 하나의 client session을 사용한다

- **WHEN** production API가 Query operation을 실행한다
- **THEN** operation은 PgBouncer에 하나의 client connection을 만들고 모든 operation SQL에 같은 `ctx.db`를 사용한다
- **AND** Query 전체를 감싸는 database transaction을 만들지 않는다

#### Scenario: Mutation의 domain transaction을 보존한다

- **WHEN** Mutation이 transaction 또는 savepoint를 소유하는 core action을 호출한다
- **THEN** core action은 operation connection 안에서 기존 transaction 또는 savepoint를 실행한다
- **AND** sibling mutation field를 하나의 transaction으로 묶지 않는다

#### Scenario: Mutation nested result가 같은 session을 사용한다

- **WHEN** Mutation domain action이 payload를 반환하고 nested result resolver 또는 loader가 실행된다
- **THEN** root action, nested resolver와 loader의 user-data SQL은 같은 operation `ctx.db`를 사용한다
- **AND** nested result는 operation session 밖의 global 또는 raw DB handle을 사용하지 않는다

#### Scenario: selectProfile이 같은 operation session actor를 전환한다

- **WHEN** 같은 serial Mutation operation이 `selectProfile`을 실행해 `Sessions.activeProfileId`와 `ctx.session.profileId`를 selected Profile로 갱신하고 뒤이어 다음 top-level Mutation field를 실행한다
- **THEN** `selectProfile`이 소유하는 새 action-local narrow transaction에서 Session update와 session-level `kosmo.profile_id` 갱신이 같은 operation `ctx.db`에 완료된다
- **AND** transaction 성공 뒤 다음 top-level Mutation field는 같은 operation Database에서 새 `ctx.session.profileId`와 `kosmo.profile_id`를 관찰한다
- **AND** `kosmo.account_id`는 변경하지 않고 operation-wide transaction을 추가하지 않는다
- **AND** 이 계약은 serial sibling 사이 stale GUC 전환만 다루며 authorization concurrency, locking 또는 TOCTOU safety를 보장하지 않는다

#### Scenario: remote materialization 뒤 최종 query가 operation session을 사용한다

- **WHEN** 인증된 `searchProfiles`가 Fedify-owned remote actor materialization을 direct DB에서 완료한다
- **THEN** materialization 뒤 최종 Profile query와 result projection은 같은 GraphQL operation `ctx.db`를 사용한다
- **AND** Fedify materialization 자체는 이 operation session의 user-data SQL requirement에서 제외된다

### Requirement: Account와 Profile actor setting을 같은 session에 공급한다

**Authority / Provenance**: Linear PROD-370, Linear PROD-726.

각 Query와 Mutation operation은 SQL 실행 전에 같은 client connection에서 `kosmo.account_id`와 `kosmo.profile_id`를 모두 session-level setting으로 설정해야 한다(MUST). 인증 identity가 존재하면 대응 UUID를 사용하고 존재하지 않으면 빈 문자열을 사용해야 한다(MUST). setting SQL이 실패한 operation은 resolver SQL을 실행하지 않고 종료해야 한다(MUST). Public helper의 UUID/`NULL` 해석은 integration과 live activation gate에서 검증하며 operation마다 read-back SQL을 반복해서는 안 된다(MUST NOT).

#### Scenario: Account와 selected Profile이 있음

- **WHEN** 인증된 request의 operation context에 Account ID와 selected Profile ID가 있다
- **THEN** 두 UUID를 각각의 session-level setting에 기록한다
- **AND** setting SQL이 성공하면 같은 connection에서 operation SQL을 실행한다

#### Scenario: 선택된 Profile이 없음

- **WHEN** 인증된 Account에 selected Profile이 없는 상태로 operation을 실행한다
- **THEN** Account setting에는 Account UUID를, Profile setting에는 빈 문자열을 기록한다

#### Scenario: 인증 identity가 없음

- **WHEN** 익명 request에서 operation을 실행한다
- **THEN** Account와 Profile setting을 모두 빈 문자열로 기록한다

### Requirement: 일반 operation execution 뒤 connection을 종료한다

**Authority / Provenance**: `docs/operations/postgres-session-pool.md`, Linear PROD-726.

API는 현재 runtime이 사용하는 일반 Query/Mutation `ExecutionResult`가 완료될 때까지 operation connection을 유지해야 한다(MUST). 정상 완료, GraphQL 오류, execution throw, cancellation, timeout과 abort의 모든 종료 경로는 `finally`에서 connection 종료를 await해야 한다(MUST). Query/Mutation incremental execution과 Subscription은 이 lifecycle에서 제외해야 한다(MUST).

#### Scenario: 일반 operation 완료

- **WHEN** Query 또는 Mutation이 일반 execution result로 끝난다
- **THEN** 모든 SQL과 awaited post-commit 작업이 끝난 뒤 client connection을 종료한다

#### Scenario: execution 또는 request가 중단됨

- **WHEN** execution이 throw하거나 request가 abort된다
- **THEN** API는 connection 종료를 await한다
- **AND** 중단된 operation의 connection을 다른 operation context에 전달하지 않는다

#### Scenario: Subscription 실행

- **WHEN** GraphQL Subscription operation이 요청된다
- **THEN** API는 Query/Mutation용 장기 PgBouncer client connection을 할당하지 않는다

#### Scenario: incremental Query 또는 Mutation이 활성화되지 않음

- **WHEN** 현재 production GraphQL runtime을 구성한다
- **THEN** API는 `@defer`·`@stream` 또는 custom AsyncIterable connection bridge를 추가하지 않는다

### Requirement: batch sibling과 overload를 격리한다

**Authority / Provenance**: `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`, Linear PROD-726.

같은 HTTP batch의 sibling operation은 client connection, actor setting, DataLoader registry와 Pothos execution cache를 공유해서는 안 된다(MUST NOT). API는 postgres.js의 bounded connection timeout을 사용해야 하며(MUST), 별도 semaphore 또는 retry queue를 추가해서는 안 된다(MUST NOT). 정의된 capacity 안의 operation은 교착 없이 완료되어야 하고(MUST), connection을 제한 시간 안에 만들지 못한 operation은 실패하고 connection 또는 actor setting을 누출해서는 안 된다(MUST NOT).

#### Scenario: HTTP batch sibling 격리

- **WHEN** 하나의 HTTP request가 둘 이상의 Query 또는 Mutation operation을 실행한다
- **THEN** 각 operation은 별도 client connection과 actor setting을 사용한다
- **AND** DataLoader registry와 Pothos execution cache를 공유하지 않는다

#### Scenario: connection capacity 초과

- **WHEN** 동시에 시작된 operation이 사용 가능한 connection capacity를 초과한다
- **THEN** postgres.js connection timeout 안에 connection을 얻지 못한 operation은 제한된 오류로 종료한다
- **AND** custom retry queue를 만들거나 종료되지 않은 client connection을 남기지 않는다

### Requirement: client 종료 뒤 backend session state가 유출되지 않는다

**Authority / Provenance**: `docs/operations/postgres-session-pool.md`, Linear PROD-728, Linear PROD-726.

API client connection 종료는 PgBouncer가 반환된 backend connection에 `DISCARD ALL`을 적용할 수 있게 해야 한다(MUST). 운영 검증은 이전 operation과 같은 backend가 재사용된 경우 Account/Profile actor setting이 비어 있고 helper가 `NULL`을 반환함을 확인해야 한다(MUST). API endpoint 전환 완료는 session mode, 동일 operation의 backend affinity, reset, client/server pool metrics와 connection 누출 부재의 live evidence를 요구한다(MUST).

#### Scenario: 같은 backend를 다음 operation이 재사용함

- **WHEN** actor setting을 사용한 operation이 client connection을 종료하고 다음 operation이 같은 backend session을 재사용한다
- **THEN** 다음 operation을 초기화하기 전 이전 Account/Profile setting이 남아 있지 않는다
- **AND** helper는 이전 actor UUID를 반환하지 않는다

#### Scenario: live operation endpoint activation gate

- **WHEN** dev 환경에서 API `OPERATION_DATABASE_URL`을 Pooler endpoint로 전환한다
- **THEN** operation별 connection, session affinity와 reset을 비민감한 probe로 확인한다
- **AND** PgBouncer active/waiting client, active/idle server와 max wait metrics를 관찰한다
