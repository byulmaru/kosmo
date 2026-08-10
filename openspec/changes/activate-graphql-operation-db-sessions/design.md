## Context

PROD-708은 request identity와 operation context를 분리하고 operation별 cache/DataLoader/`ctx.db` seam을 만들었으며, PROD-371은 Post 관련 call graph를 그 handle로 정렬했다. 현재 `createOperationContext`는 여전히 global Drizzle `db`를 복사하고 Yoga execution lifecycle에는 connection owner가 없다. Account/Profile/Media/Hashtag/Session/Feedback 및 일부 core action은 global DB를 직접 사용한다.

PROD-728의 CloudNativePG Pooler는 dev/prod에 session mode와 `DISCARD ALL`로 배포돼 있으며 direct Service와 공존한다. PROD-370은 actor setting key와 fail-closed read helper를 제공한다. 현재 Helm의 API/Web/worker는 같은 API-role database URL helper를 사용하므로, credential 선택과 별개로 GraphQL API endpoint만 Pooler로 보내는 workload-specific URL 경계가 필요하다.

GraphQL Yoga/Envelop의 `onExecute` hook은 execution 직전에 context를 확장하고 execute function을 대체할 수 있다. 현재 저장소에는 `@defer`, `@stream` 또는 incremental executor가 없으므로 일반 Query/Mutation execute lifecycle만 소유하면 된다.

## Goals / Non-Goals

**Goals:**

- 모든 production Query/Mutation SQL이 operation별 하나의 실제 PgBouncer client connection을 사용하게 한다.
- Account/Profile actor GUC를 같은 session에서 공급하고 helper 의미는 integration/live gate에서 일회성으로 확인한다.
- 일반 Query/Mutation 결과의 모든 종료 경로에서 connection 종료를 await한다.
- 기존 domain transaction·savepoint·post-commit 의미와 HTTP batch operation 격리를 보존한다.
- API만 Pooler endpoint로 전환하고 Web BFF, worker와 migration은 direct endpoint를 유지한다.
- dev live gate에서 affinity, reset, readiness, metrics와 overload/cleanup을 관찰한다.

**Non-Goals:**

- operation-wide transaction 또는 sibling mutation field 원자성
- Subscription 수명 동안 장기 DB session 유지
- Query/Mutation `@defer`·`@stream` 또는 custom AsyncIterable connection bridge
- RLS policy·grant, 애플리케이션 권한 predicate 제거와 non-owner credential 전환
- Pooler CRD, replica, resource와 PgBouncer capacity 재설계
- GraphQL schema, domain 결과, 목록·pagination 변경
- request identity SQL이나 startup/bootstrap SQL의 operation handle 이전

## Implementation Guidance

### Current Constraints

- global `db`는 process-wide postgres.js pool과 Drizzle schema를 함께 생성한다. operation connection은 schema를 재사용하되 global pool lease가 아니라 종료 가능한 별도 client owner를 가져야 한다.
- postgres.js client는 lazy connection이므로 actor setting 초기화가 실제 frontend connection을 연 뒤 같은 connection에 고정되도록 per-operation client의 `max`를 1로 제한해야 한다.
- actor setting은 transaction-local이 아니라 session-level이어야 하며 Account/Profile 값이 없는 경우에도 빈 문자열을 명시해 두 key의 상태를 결정해야 한다.
- Yoga context factory는 operation별 cache를 만들지만 Query/Mutation/Subscription 분기와 execute 결과 수명은 execution hook에서 확인해야 한다.
- API/Web/worker가 현재 같은 `kosmo.apiDatabaseUrl` helper를 사용한다. 기존 helper를 Pooler로 바꾸면 Web/worker까지 함께 전환되므로 GraphQL API용 endpoint 표현을 분리해야 한다.
- request authentication은 operation마다 재실행하지 않으며 global DB pool에 남는다. API workload의 `DATABASE_URL` 자체가 Pooler를 가리키더라도 actor GUC를 쓰는 dedicated operation connection과 lifecycle은 분리해야 한다.

### Recommended Approach

- core DB 모듈에 기존 postgres.js connection 옵션과 Drizzle schema를 재사용하는 좁은 operation client factory를 둔다. factory는 `max: 1`과 bounded connect timeout을 가진 새 postgres.js client, 그 client의 Drizzle `Database`, idempotent async close를 함께 반환한다.
- Yoga plugin의 `onExecute`에서 parsed operation이 일반 Query/Mutation인지 확인한다. Subscription은 할당하지 않는다. Query/Mutation은 operation client를 만들고 두 GUC를 한 초기화 단계에서 session-level로 설정한 뒤 context의 `db`를 operation Database로 교체한다. helper read-back은 integration/live 검증에만 사용한다.
- plugin이 현재 execute function을 감싸 일반 result 또는 throw의 `finally`에서 close를 한 번 await한다. 현재 활성화되지 않은 incremental AsyncIterable bridge는 추가하지 않는다.
- resolver/loader/core call graph를 domain별로 인벤토리하고 global/raw DB import를 `ctx.db` 또는 명시적 `DatabaseHandle`로 바꾼다. core action이 이미 transaction을 소유하면 operation Database에서 transaction을 열고, caller-owned transaction과 savepoint 계약은 유지한다. GraphQL post-commit SQL은 close 전에 같은 operation Database로 await한다.
- Helm에 GraphQL API 전용 Pooler database URL helper를 추가하고 API Rollout만 사용한다. 기존 API-role Secret 참조는 유지하며 Web, worker와 migration의 URL helper는 direct Service를 계속 가리킨다. credential selector 구조는 PROD-716이 후속으로 확장한다.
- lifecycle unit test는 fake client owner로 정상 result, GraphQL 오류, execute throw, abort, Subscription bypass와 idempotent close를 검증한다. integration test는 batch sibling의 다른 Database identity, actor setting/helper 의미, nested loader/core handle과 기존 Post 회귀를 검증한다.

### Allowed Alternatives

- 두 actor GUC는 같은 frontend connection에서 모두 성공하거나 operation을 중단하는 한 하나 또는 둘의 SQL round trip으로 설정할 수 있다.

### Known Traps

- global postgres.js pool의 `reserve()` lease만 반환하면 application이 frontend connection을 operation 사이에 재사용하므로 선택한 client-disconnect reset 경계를 충족하지 않는다.
- global `db` fallback을 core service 안에 남기면 actor GUC를 설정한 operation session 밖에서 SQL이 실행된다.
- actor가 없는 GUC를 설정하지 않으면 재사용 backend의 이전 값과 missing 상태를 구분하지 못한다.
- helper read-back을 매 operation 반복하면 이미 성공한 setting을 다시 확인하는 추가 round trip과 불필요한 runtime 결합이 생긴다.
- 현재 runtime에 없는 `@defer`·`@stream`을 위해 custom AsyncIterator wrapper를 만들면 사용되지 않는 cleanup 분기와 upgrade 부담이 생긴다.
- 기존 `kosmo.apiDatabaseUrl`을 API/Web/worker가 계속 공유한 채 endpoint를 바꾸면 Web/worker까지 함께 전환되어 독립 rollback 경계를 깨뜨린다. 기존 direct helper는 보존하고 API 전용 Pooler helper를 분리한다.
- endpoint를 바꾸면서 Secret 또는 role까지 변경하면 PROD-716 credential transition을 선점한다.

## Risks / Trade-offs

- [operation마다 frontend connection을 열고 닫아 latency와 PgBouncer client churn이 증가함] → session lifecycle 단순성과 reset 증명을 우선하고 dev load probe에서 connect latency, client waiting과 max wait를 관찰한다.
- [동시 operation이 PgBouncer 또는 PostgreSQL capacity를 초과함] → postgres.js connect timeout으로 대기를 제한하고 custom queue 없이 bounded failure를 검증한다.
- [execute 오류나 abort에서 connection이 남음] → wrapper `finally`와 close-once unit test, live connection metric baseline 복귀를 완료 gate로 둔다.
- [대규모 consumer 이전에서 global DB call이 누락됨] → CodeGraph call path와 targeted static search를 함께 사용하고 domain별 integration test에서 주입한 handle identity를 검증한다.
- [API endpoint 전환이 request auth pool에도 적용됨] → request auth는 actor GUC를 사용하지 않으며 기존 결과를 회귀 검증한다. API endpoint만 direct Service로 되돌리는 rollback을 유지한다.
- [PgBouncer reset 실패가 다음 operation actor를 오염시킴] → same-backend reset probe가 실패하면 PROD-716 credential 전환을 금지하고 API endpoint를 direct Service로 rollback한다.

## Migration Plan

1. 남은 GraphQL consumer와 core action을 operation handle로 정렬하고 global/raw fallback inventory를 0으로 만든다.
2. operation client factory와 Yoga 일반 Query/Mutation lifecycle plugin을 추가해 direct PostgreSQL test target에서 lifecycle·batch·actor setting을 검증한다.
3. Helm render에서 API만 Pooler URL, Web/worker/migration은 direct URL, 모든 Secret 참조는 기존 값임을 확인한다.
4. dev에 배포하고 Argo sync, API rollout/readiness와 기존 GraphQL 회귀를 확인한다.
5. dev에서 operation connection affinity, 두 actor helper의 일회성 의미, 정상·오류·abort cleanup, same-backend `DISCARD ALL` reset과 `cnpg_pgbouncer_*` metrics를 비민감하게 검증한다.
6. 정의된 capacity와 초과 부하에서 completion, bounded timeout, max wait와 connection baseline 복귀를 확인한다.
7. 실패 시 application credential이나 out-of-band Kubernetes resource를 변경하지 않고 API endpoint만 direct Service로 되돌린 Git revert를 배포한다. Web/worker/migration, Pooler와 Cluster는 유지한다.
8. 전체 live gate가 통과한 뒤에만 PROD-716 credential transition의 blocker를 해소한다.

## Open Questions

없음.
