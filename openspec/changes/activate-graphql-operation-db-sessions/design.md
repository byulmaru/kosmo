## Context

PROD-708은 request identity와 operation context를 분리하고 operation별 cache/DataLoader/`ctx.db` seam을 만들었으며, PROD-371은 Post 관련 call graph를 그 handle로 정렬했다. 현재 `createOperationContext`는 여전히 global Drizzle `db`를 복사하고 Yoga execution lifecycle에는 connection owner가 없다. Account/Profile/Media/Hashtag/Session/Feedback 및 일부 core action은 global DB를 직접 사용한다.

PROD-728의 CloudNativePG Pooler는 dev/prod에 session mode와 `DISCARD ALL`로 배포돼 있으며 direct Service와 공존한다. PROD-370은 actor setting key와 fail-closed read helper를 제공한다. API `DATABASE_URL`은 request authentication과 startup/bootstrap을 위해 direct Service를 유지하고, GraphQL operation connection만 `OPERATION_DATABASE_URL`을 통해 Pooler로 보내야 한다. `postgres.credentials.api` trio가 구성된 경우에도 rendered env의 username, database와 password Secret source, scheme, path와 query는 그대로 유지하고 operation URL의 host와 port를 포함한 authority만 in-chart Pooler Service `<release>-postgres-pooler-rw:5432`로 교체한다. Runtime operation client는 URL query에서 `idle_in_transaction_session_timeout`, `lock_timeout`, `statement_timeout` 세 key만 제거하고 unrelated query parameter는 보존한다. Web/worker/migration의 direct endpoint와 credential 선택은 이 change에서 바꾸지 않는다.

Merge revision `de6034d3`의 dev activation에서는 operation client가 `idle_in_transaction_session_timeout=30000`을 startup parameter로 PgBouncer에 전달해 초기화 단계에서 거부됐고, GraphQL Query/Mutation이 HTTP 500으로 실패했다. Direct client의 기존 timeout startup 옵션은 유지하되, Pooler operation client는 지원되지 않는 server timeout startup parameter를 보내지 않고 actor GUC와 세 timeout을 session-level initialization SQL 한 번에 설정해야 한다. 이 incident에 대한 사용자 결정은 전체 activation revert가 아닌 forward fix이며 endpoint, credential/Secret selector, Pooler CR·replica·resource·capacity는 변경하지 않는다.

GraphQL Yoga/Envelop의 `onExecute` hook은 execution 직전에 context를 확장하고 execute function을 대체할 수 있다. 현재 저장소에는 `@defer`, `@stream` 또는 incremental executor가 없으므로 일반 Query/Mutation execute lifecycle만 소유하면 된다.

## Goals / Non-Goals

**Goals:**

- 모든 production GraphQL user-data query, result projection과 domain action SQL이 operation별 하나의 실제 PgBouncer client connection을 사용하게 한다. Mutation nested result resolver와 loader도 같은 operation handle을 사용한다.
- Account/Profile actor GUC와 operation session timeout을 같은 session에서 공급하고 helper 의미는 integration/live gate에서 일회성으로 확인한다.
- `selectProfile` Mutation이 `Sessions.activeProfileId`와 `ctx.session.profileId`를 갱신한 뒤 `selectProfile`이 소유하는 action-local narrow transaction에서 session-level `kosmo.profile_id`를 갱신해 같은 operation의 다음 top-level Mutation field가 새 actor를 사용하게 한다. `kosmo.account_id`는 유지하고 operation-wide transaction은 만들지 않는다. 범위는 serial sibling 사이 stale GUC 전환이며 authorization concurrency, locking 또는 TOCTOU safety는 다루지 않는다.
- 일반 Query/Mutation 결과의 모든 종료 경로에서 connection 종료를 await한다.
- 기존 domain transaction·savepoint·post-commit 의미와 HTTP batch operation 격리를 보존한다.
- API `DATABASE_URL`은 direct endpoint를 유지하고 `OPERATION_DATABASE_URL`만 Pooler endpoint로 전환하며 Web BFF, worker와 migration은 direct endpoint를 유지한다.
- dev live gate에서 affinity, reset, readiness, metrics와 overload/cleanup을 관찰한다.

**Non-Goals:**

- operation-wide transaction 또는 sibling mutation field 원자성
- Subscription 수명 동안 장기 DB session 유지
- Query/Mutation `@defer`·`@stream` 또는 custom AsyncIterable connection bridge
- `selectProfile` actor 전환을 넘어서는 authorization concurrency, locking 또는 TOCTOU safety
- RLS policy·grant, 애플리케이션 권한 predicate 제거와 non-owner credential 전환
- Fedify inbound/delivery, Temporal Workflow/Activity와 worker의 RLS 또는 operation session 전환
- Pooler CRD, replica, resource와 PgBouncer capacity 재설계
- GraphQL schema, domain 결과, 목록·pagination 변경
- request identity SQL이나 startup/bootstrap SQL의 operation handle 이전

## Implementation Guidance

### Current Constraints

- global `db`는 process-wide postgres.js pool과 Drizzle schema를 함께 생성한다. operation connection은 schema를 재사용하되 global pool lease가 아니라 종료 가능한 별도 client owner를 가져야 한다.
- postgres.js client는 lazy connection이므로 actor setting 초기화가 실제 frontend connection을 연 뒤 같은 connection에 고정되도록 per-operation client의 `max`를 1로 제한해야 한다.
- direct postgres.js client만 `idle_in_transaction_session_timeout`, `lock_timeout`, `statement_timeout`을 기존 server startup 옵션으로 유지한다. Pooler operation client는 이 server timeout startup 옵션을 제거하고 actor GUC와 같은 initialization SQL round trip에서 세 timeout을 session-level로 설정해야 하며, 성공 전에는 resolver를 실행하지 않는다.
- actor setting은 transaction-local이 아니라 session-level이어야 하며 Account/Profile 값이 없는 경우에도 빈 문자열을 명시해 두 key의 상태를 결정해야 한다.
- actor transition을 수행하는 `selectProfile`은 자신이 소유하는 action-local narrow transaction에서 `Sessions.activeProfileId` update, `kosmo.profile_id` session setting과 `ctx.session.profileId` 갱신을 같은 operation Database에 반영한 뒤 다음 top-level Mutation field로 진행해야 한다. Account setting은 변경하지 않는다.
- Yoga context factory는 operation별 cache를 만들지만 Query/Mutation/Subscription 분기와 execute 결과 수명은 execution hook에서 확인해야 한다.
- API/Web/worker가 현재 같은 `kosmo.apiDatabaseUrl` helper를 사용한다. API `DATABASE_URL`은 direct helper로 보존하고 GraphQL operation 전용 `OPERATION_DATABASE_URL`만 Pooler helper를 사용하도록 endpoint 표현을 분리해야 한다.
- request authentication과 startup/bootstrap SQL은 operation마다 재실행하지 않으며 API `DATABASE_URL` direct DB 경계에 남는다. 인증된 `searchProfiles`가 촉발하는 Fedify-owned remote actor materialization만 trusted direct side effect 예외이며, materialization 뒤 최종 GraphQL query는 operation `ctx.db`를 사용한다.

### Recommended Approach

- core DB 모듈에 기존 postgres.js connection 옵션과 Drizzle schema를 재사용하는 좁은 operation client factory를 둔다. factory는 `max: 1`과 bounded connect timeout을 가진 새 postgres.js client, 그 client의 Drizzle `Database`, idempotent async close를 함께 반환한다.
- Yoga plugin의 `onExecute`에서 parsed operation이 일반 Query/Mutation인지 확인한다. Subscription은 할당하지 않는다. Query/Mutation은 operation client를 만들고 두 GUC와 세 session timeout을 하나의 initialization SQL round trip에서 설정한 뒤 context의 `db`를 operation Database로 교체한다. 초기화가 성공하기 전 resolver를 실행하지 않으며, helper read-back은 integration/live 검증에만 사용한다.
- plugin이 현재 execute function을 감싸 일반 result 또는 throw의 `finally`에서 close를 한 번 await한다. 현재 활성화되지 않은 incremental AsyncIterable bridge는 추가하지 않는다.
- resolver/loader/core call graph를 domain별로 인벤토리하고 global/raw DB import를 `ctx.db` 또는 명시적 `DatabaseHandle`로 바꾼다. core action이 이미 transaction을 소유하면 operation Database에서 transaction을 열고, caller-owned transaction과 savepoint 계약은 유지한다. GraphQL post-commit SQL은 close 전에 같은 operation Database로 await한다. 단, `searchProfiles` remote actor materialization은 Fedify-owned direct side effect로 실행하고 materialization 뒤 조회·result projection은 `ctx.db`로 실행한다.
- `selectProfile` resolver는 자신이 소유하는 새 action-local narrow transaction에서 `Sessions.activeProfileId`를 저장하고 같은 `ctx.db` transaction의 session-level setting으로 `kosmo.profile_id`를 갱신한다. transaction이 성공한 뒤 `ctx.session.profileId`를 바꾸고, GraphQL serial Mutation의 다음 top-level field가 같은 operation Database와 새 actor setting을 사용하게 한다. 이 흐름에 operation-wide transaction을 추가하지 않으며 authorization concurrency, locking 또는 TOCTOU safety를 약속하지 않는다.
- Helm에 API direct `DATABASE_URL`과 GraphQL operation 전용 Pooler `OPERATION_DATABASE_URL` helper를 추가하고 API Rollout만 operation URL을 사용한다. 기존 API-role Secret 참조와 trio의 username/database/password source는 유지하며, configured trio에서도 rendered operation URL의 host와 port를 포함한 authority만 in-chart Pooler Service `<release>-postgres-pooler-rw:5432`로 교체하고 scheme, path와 query를 보존한다. Runtime operation client는 그 query에서 세 server timeout key만 제거하고 다른 query parameter는 보존한다. Web, worker와 migration의 URL helper는 direct Service를 계속 가리킨다. 새 credential selector는 만들지 않으며 credential·role·grant transition은 PROD-716이 후속으로 소유한다.
- lifecycle unit test는 fake client owner로 정상 result, GraphQL 오류, execute throw, abort, Subscription bypass와 idempotent close를 검증한다. integration test는 batch sibling의 다른 Database identity, actor setting/helper 의미, nested loader/core handle과 기존 Post 회귀를 검증한다.

### Allowed Alternatives

- 없다. Pooler 호환성을 위해 actor GUC와 세 session timeout은 하나의 initialization SQL round trip에서 설정한다. client-only connect timeout은 postgres.js 옵션으로 유지할 수 있다.

### Known Traps

- global postgres.js pool의 `reserve()` lease만 반환하면 application이 frontend connection을 operation 사이에 재사용하므로 선택한 client-disconnect reset 경계를 충족하지 않는다.
- global `db` fallback을 core service 안에 남기면 actor GUC를 설정한 operation session 밖에서 SQL이 실행된다.
- `selectProfile`에서 `ctx.session.profileId`만 바꾸고 같은 operation Database의 `kosmo.profile_id`를 갱신하지 않으면 다음 top-level Mutation field가 이전 actor를 사용한다. 반대로 별도 connection이나 operation-wide transaction을 추가하면 session lifecycle과 `selectProfile`-owned narrow transaction 경계를 깨뜨린다. 이 transition은 authorization concurrency, locking 또는 TOCTOU를 해결하지 않는다.
- actor가 없는 GUC를 설정하지 않으면 재사용 backend의 이전 값과 missing 상태를 구분하지 못한다.
- Pooler가 지원하지 않는 server timeout startup parameter를 operation client에 남기면 frontend connection 자체가 초기화 단계에서 거부되어 모든 GraphQL operation이 HTTP 500으로 실패한다. direct client의 startup 옵션과 operation client의 session SQL 경계를 혼동하지 않는다.
- helper read-back을 매 operation 반복하면 이미 성공한 setting을 다시 확인하는 추가 round trip과 불필요한 runtime 결합이 생긴다.
- 현재 runtime에 없는 `@defer`·`@stream`을 위해 custom AsyncIterator wrapper를 만들면 사용되지 않는 cleanup 분기와 upgrade 부담이 생긴다.
- API `DATABASE_URL`과 operation `OPERATION_DATABASE_URL`을 같은 값으로 바꾸면 request auth와 operation lifecycle이 결합되어 독립 rollback 경계를 깨뜨린다. direct helper는 보존하고 operation 전용 Pooler helper를 분리한다.
- endpoint를 바꾸면서 Secret 또는 role까지 변경하면 PROD-716 credential transition을 선점한다.

## Risks / Trade-offs

- [operation마다 frontend connection을 열고 닫아 latency와 PgBouncer client churn이 증가함] → session lifecycle 단순성과 reset 증명을 우선하고 dev load probe에서 connect latency, client waiting과 max wait를 관찰한다.
- [동시 operation이 PgBouncer 또는 PostgreSQL capacity를 초과함] → postgres.js connect timeout으로 대기를 제한하고 custom queue 없이 bounded failure를 검증한다.
- [execute 오류나 abort에서 connection이 남음] → wrapper `finally`와 close-once unit test, live connection metric baseline 복귀를 완료 gate로 둔다.
- [대규모 consumer 이전에서 global DB call이 누락됨] → CodeGraph call path와 targeted static search를 함께 사용하고 domain별 integration test에서 주입한 handle identity를 검증한다.
- [operation endpoint 전환이 request auth pool에도 적용됨] → request auth/startup은 API `DATABASE_URL` direct를 사용하고 operation `OPERATION_DATABASE_URL`만 Pooler를 사용하도록 render와 live env를 검증한다. rollback은 전체 activation merge/squash revision을 Git revert해 API `DATABASE_URL` direct와 `OPERATION_DATABASE_URL` env 부재를 복원한다.
- [PgBouncer reset 실패가 다음 operation actor를 오염시킴] → same-backend reset probe가 실패하면 PROD-716 credential 전환을 금지하고 전체 activation revision을 pre-activation tree로 revert한다. Pooler 리소스는 유지한다.
- [operation startup parameter 호환성 오류가 dev GraphQL을 초기화 단계에서 실패시킴] → operation client에서 server timeout startup 옵션을 제거하고 actor GUC와 세 timeout을 한 session SQL round trip으로 설정한다. current API Pod 로그의 unsupported startup-parameter 오류가 없고 기존 GraphQL smoke가 성공할 때까지 live gate를 닫지 않는다.

## Migration Plan

1. 남은 GraphQL consumer와 core action을 operation handle로 정렬하고 global/raw fallback inventory를 0으로 만든다.
2. operation client factory와 Yoga 일반 Query/Mutation lifecycle plugin을 추가해 direct PostgreSQL test target에서 lifecycle·batch·actor setting을 검증한다.
3. Helm render에서 API `DATABASE_URL`은 direct, `OPERATION_DATABASE_URL`만 Pooler, Web/worker/migration은 direct URL이며 모든 Secret 참조가 기존 값임을 확인한다.
4. forward fix release를 dev에 배포하고 Argo sync, API rollout/readiness와 current Pod 로그의 unsupported startup-parameter 부재를 확인한다. direct client의 기존 timeout startup 옵션과 operation client의 session timeout SQL 경계를 정적으로 확인한다.
5. 기존 GraphQL smoke를 익명·Account-only·Account+Profile matrix로 실행해 초기화 HTTP 500이 없고 기대한 결과가 나오는지 확인한다.
6. dev에서 operation connection affinity, 두 actor helper의 일회성 의미, 정상·오류·abort cleanup, same-backend `DISCARD ALL` reset과 `cnpg_pgbouncer_*` metrics를 비민감하게 검증한다.
7. 정의된 capacity와 초과 부하에서 completion, bounded timeout, max wait와 connection baseline 복귀를 확인한다.
8. 실패 시 application credential이나 out-of-band Kubernetes resource를 변경하지 않고 전체 activation merge/squash revision을 Git revert해 pre-activation tree를 배포한다. API `DATABASE_URL`은 direct Service를 유지하고 `OPERATION_DATABASE_URL` env와 operation plugin/code는 제거한다. Web/worker/migration, Pooler와 Cluster는 유지하며 Pooler manifest를 prune하지 않는다.
9. PROD-716 credential·role·RLS policy/grant transition은 이 change의 live gate나 rollback에 포함하지 않고 별도 작업으로 남긴다.

## Open Questions

없음.
