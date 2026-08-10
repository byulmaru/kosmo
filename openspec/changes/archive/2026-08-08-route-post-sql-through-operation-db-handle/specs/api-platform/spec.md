## ADDED Requirements

### Requirement: Post API SQL의 operation DB handle 정렬

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-371. Production GraphQL의 Post/PostContent 조회와 변경 경로는 해당 operation context의 명시적 `ctx.db` handle로 모든 SQL을 실행해야 한다(MUST). Post loader·field·list·mutation과 Post를 조회하거나 변경하는 bookmark·reaction·notification projection이 호출하는 core action은 같은 handle을 전달받아야 하며(MUST), 이 production call graph에는 전역 또는 raw DB fallback이 없어야 한다(MUST NOT).

#### Scenario: Post 조회가 operation handle을 사용한다

- **WHEN** GraphQL operation이 Post/PostContent Node, Post list, reply 관계, repost projection 또는 관련 bookmark·reaction·notification projection을 조회한다
- **THEN** 해당 경로의 모든 Post/PostContent SQL은 그 operation의 `ctx.db` handle로 실행된다
- **AND** loader와 중첩 field가 전역 DB handle을 직접 사용하지 않는다

#### Scenario: Post 변경이 operation handle 안에서 실행된다

- **WHEN** GraphQL operation이 Post 생성, reply, repost, delete 또는 Post에 결합된 bookmark·reaction 변경을 실행한다
- **THEN** resolver는 `ctx.db`를 호출하는 core action과 관련 savepoint에 전달한다
- **AND** core action의 기존 domain transaction은 전달받은 handle 안에서 유지된다

### Requirement: Post API handle 전환의 행동 호환성

**Authority / Provenance:** `docs/architecture/core-services.md`, `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, PROD-371. Post API SQL handle 전환은 기존 owner credential, 애플리케이션 권한 predicate, 목록 후보·정렬·pagination, GraphQL schema와 domain transaction·savepoint 의미를 유지해야 한다(MUST). 이 전환은 새 DB connection이나 operation-wide transaction을 열어서는 안 되며(MUST NOT), PgBouncer endpoint, actor GUC, RLS policy·grant 또는 workload credential을 변경해서는 안 된다(MUST NOT).

#### Scenario: 현재 global handle seam에서 동작이 유지된다

- **WHEN** `ctx.db`가 PROD-708의 기존 global DB handle을 가리키는 상태로 전환된 API를 배포한다
- **THEN** 기존 Post/PostContent 조회·변경 결과와 권한 predicate 결과가 유지된다
- **AND** 새 connection이나 operation-wide transaction이 생성되지 않는다

#### Scenario: 후속 활성화 범위가 분리된다

- **WHEN** PROD-371 변경만 배포하거나 rollback한다
- **THEN** API와 Web의 database endpoint 및 credential은 기존 값을 유지한다
- **AND** operation DB session, actor GUC와 RLS enforcement 활성화는 후속 이슈가 소유한다
