## Why

GraphQL operation context와 Post SQL handle seam, CloudNativePG PgBouncer session pool, 안전한 actor setting helper는 각각 준비됐지만 production Query/Mutation은 아직 direct PostgreSQL endpoint와 global DB handle을 사용한다. 모든 operation SQL을 하나의 격리된 PgBouncer client session으로 정렬해야 후속 non-owner RLS credential 전환 전에 actor context의 수명과 누출 방지 경계를 실제 runtime에서 검증할 수 있다.

## What Changes

- production GraphQL의 모든 root·field·loader와 이들이 호출하는 core service SQL을 operation별 `ctx.db`로 정렬한다.
- 각 일반 Query/Mutation operation마다 실제 PgBouncer client connection을 하나 만들고 Account/Profile actor GUC를 session-level로 설정한다.
- HTTP batch sibling은 connection, DataLoader와 실행 cache를 공유하지 않는다.
- 정상 완료, GraphQL 오류, execution throw와 request abort에서 connection 종료를 await하고 다음 client에 session state가 유출되지 않게 한다.
- API workload만 `kosmo-postgres-pooler-rw` endpoint로 전환하고 Web BFF, worker와 migration workload는 direct `kosmo-postgres-rw`를 유지한다.
- 기존 domain transaction·savepoint·post-commit 의미는 유지하고 operation-wide transaction, RLS policy·grant, credential 전환은 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`
- Linear Contract: PROD-726
- Linear Implementations: PROD-708, PROD-371, PROD-728, PROD-370

## Capabilities

### New Capabilities

- `graphql-operation-db-session`: 일반 Query/Mutation별 PgBouncer client session, actor GUC, cleanup와 과부하 경계를 정의한다.

### Modified Capabilities

- `api-platform`: 모든 production GraphQL operation SQL이 독립 `ctx.db` handle을 사용하도록 기존 additive seam을 실제 session lifecycle로 활성화한다.
- `postgres-session-pool`: 기존 additive Pooler를 API workload가 사용하되 Web BFF·worker·migration은 direct endpoint를 유지하고 독립 rollback할 수 있게 한다.

## Impact

- `apps/api`: GraphQL execution lifecycle, operation context, 모든 resolver·loader와 호출하는 core action의 DB handle 전달
- `packages/core`: operation handle을 받아야 하는 Profile·Account·Media·Hashtag·Session·Feedback 관련 service와 DB connection utility
- `apps/helm`: API 전용 database endpoint와 Web/worker/migration direct endpoint 분리
- `docs/operations/postgres-session-pool.md`: application activation, live gate와 API-only rollback 절차
- runtime: CloudNativePG PgBouncer session pool, postgres.js connection 생성·종료, actor GUC와 cleanup 관찰
- 제외: GraphQL schema와 제품 결과, database migration, RLS policy·grant, workload credential, Query/Mutation incremental execution, Subscription 장기 session, operation-wide transaction
