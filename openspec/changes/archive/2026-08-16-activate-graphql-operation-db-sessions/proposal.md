## Why

GraphQL operation context와 Post SQL handle seam, CloudNativePG PgBouncer session pool, 안전한 actor setting helper는 각각 준비됐지만 production GraphQL user-data query/result projection/domain action은 아직 direct PostgreSQL endpoint와 global DB handle을 사용한다. Query와 Mutation의 root, nested result와 호출된 action을 하나의 격리된 PgBouncer client session으로 정렬해야 GraphQL Query RLS를 적용할 때 actor context의 수명과 누출 방지 경계를 실제 runtime에서 검증할 수 있다.

## What Changes

- production GraphQL user-data query, result projection과 domain action의 모든 root·field·loader와 이들이 호출하는 core service SQL을 operation별 `ctx.db`로 정렬한다. Mutation nested result resolver도 같은 operation handle을 사용한다.
- 각 일반 Query/Mutation operation마다 실제 PgBouncer client connection을 하나 만들고 Account/Profile actor GUC를 session-level로 설정한다.
- API `DATABASE_URL` direct client의 기존 PostgreSQL timeout startup 동작은 이 change의 범위 밖으로 두고 변경하지 않는다. Incident의 원인은 operation client가 direct DB client의 `connection` startup options를 상속한 것이며, fix는 operation client에 그 options를 전달하지 않는 것이다. Configured `OPERATION_DATABASE_URL`은 변경 없이 postgres.js에 전달하고 runtime은 query parameter를 변경하거나 호환되지 않는 URL을 자동 보정하지 않으므로, URL은 이미 Pooler와 호환되어야 한다. Actor GUC만 하나의 session-level initialization SQL round trip에서 설정한 뒤 resolver를 시작하며, 연결 대기는 별도 숫자를 선택하지 않고 postgres.js의 기본 bounded connection timeout 동작에 맡긴다.
- `selectProfile` Mutation이 `Sessions.activeProfileId`와 `ctx.session.profileId`를 바꾸면 `selectProfile`이 소유하는 action-local narrow transaction을 같은 operation Database에서 열어 `kosmo.profile_id`를 갱신하고 이후 top-level Mutation field가 새 actor를 사용하게 한다. `kosmo.account_id`는 유지하고 operation-wide transaction을 만들지 않는다. 이 계약은 serial sibling 사이 stale GUC 전환만 다루며 authorization concurrency, locking 또는 TOCTOU safety를 보장하지 않는다.
- request authentication과 startup/bootstrap SQL은 direct `DATABASE_URL` 경계를 유지하고, 인증된 `searchProfiles`가 촉발하는 Fedify-owned remote actor materialization trusted side effect만 direct DB 예외로 둔다. materialization 뒤 최종 GraphQL query는 `ctx.db`에서 실행한다.
- HTTP batch sibling은 connection, DataLoader와 실행 cache를 공유하지 않는다.
- 정상 완료, GraphQL 오류, execution throw와 request abort에서 connection 종료를 await하고 다음 client에 session state가 유출되지 않게 한다.
- API `DATABASE_URL`은 현재 request/auth/startup에서 사용하는 owner-compatible fallback인 direct `kosmo-postgres-rw`를 유지하며 향후 GraphQL principal 방향을 결정하지 않는다. GraphQL operation 전용 `OPERATION_DATABASE_URL`만 `kosmo-postgres-pooler-rw:5432`를 사용한다. 기존 `postgres.credentials.api` trio가 구성된 경우에도 rendered env의 username, database와 password Secret source, scheme, path와 query는 현재 전환에서 재사용하고 operation URL의 host와 port를 포함한 authority만 chart 내 Pooler Service `:5432`로 교체한다. Runtime operation client는 configured URL을 변경 없이 사용하며 query parameter를 변경하거나 호환되지 않는 URL을 자동 보정하지 않는다. Web/Worker 기본 principal은 PROD-715가 별도로 소유하며 이 change의 `OPERATION_DATABASE_URL`에 공급하지 않는다. Migration direct endpoint도 이 change에서 유지한다. GraphQL principal transition은 PROD-716이 소유하고, 취소된 client-certificate/direct-rw 대안 PROD-470은 재개하지 않는다.
- 기존 domain transaction·savepoint·post-commit 의미는 유지하고 operation-wide transaction, RLS policy·grant와 credential 전환은 추가하지 않는다. Fedify, Temporal Workflow/Activity와 worker는 GraphQL RLS 범위에서 제외한다.
- Merge revision `de6034d3`의 dev activation에서 operation client가 API direct DB client의 `connection` startup options를 상속해 PgBouncer가 지원하지 않는 옵션을 전달했고, operation 초기화가 거부되어 GraphQL이 HTTP 500을 반환한 incident를 확인했다. 사용자 결정에 따라 전체 activation revert가 아닌 forward fix를 적용하며, operation client에 direct `connection` options를 전달하지 않고 configured `OPERATION_DATABASE_URL`은 변경 없이 사용한다. Endpoint·credential/Secret selector·Pooler CR 변경은 포함하지 않으며, 호환되지 않는 configured URL을 runtime이 자동 보정한다는 계약도 없다.

## Authority / Provenance

- Canonical: `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`
- Linear Contract: PROD-726
- Linear Implementations: PROD-708, PROD-371, PROD-728, PROD-370
- Parallel / Excluded: PROD-715 (Web/Worker 기본 principal), PROD-716 (GraphQL principal credential source/cutover); Role/Secret provisioning, grant와 RLS policy는 각각의 별도 issue 경계

## Capabilities

### New Capabilities

- `graphql-operation-db-session`: 일반 Query/Mutation별 PgBouncer client session, actor GUC, cleanup와 과부하 경계를 정의한다.

### Modified Capabilities

- `api-platform`: 모든 production GraphQL user-data query/result projection/domain action SQL이 독립 `ctx.db` handle을 사용하도록 기존 additive seam을 실제 session lifecycle로 활성화한다.
- `postgres-session-pool`: 기존 additive Pooler를 API의 `OPERATION_DATABASE_URL`만 사용하게 하고 API `DATABASE_URL`은 현재 owner-compatible direct fallback으로 유지한다. Web/Worker 기본 principal은 PROD-715의 별도 실행 경계로 제외하고 `OPERATION_DATABASE_URL`에 연결하지 않으며 migration은 direct endpoint를 유지한다. 실패 시 전체 activation merge/squash revision을 Git revert해 pre-activation tree로 되돌리며, PROD-728 Pooler 리소스는 유지한다.

## Impact

- `apps/api`: GraphQL execution lifecycle, operation context, 모든 resolver·loader와 호출하는 core action의 DB handle 전달
- `packages/core`: operation handle을 받아야 하는 Profile·Account·Media·Hashtag·Session·Feedback 관련 service와 DB connection utility
- `apps/helm`: API current fallback direct `DATABASE_URL`, operation 전용 Pooler `OPERATION_DATABASE_URL`, PROD-715 Web/Worker 기본 principal과 migration direct endpoint의 경계
- `docs/operations/postgres-session-pool.md`: application activation, live gate와 whole activation rollback 절차
- runtime: CloudNativePG PgBouncer session pool, postgres.js connection 생성·종료, actor GUC initialization과 cleanup 관찰
- 제외: GraphQL schema와 제품 결과, database migration, RLS policy·grant, workload credential, Fedify/Temporal/worker RLS, Query/Mutation incremental execution, Subscription 장기 session, operation-wide transaction
