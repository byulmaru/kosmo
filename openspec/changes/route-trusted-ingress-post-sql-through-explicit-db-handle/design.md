## Context

`packages/core`에는 `DatabaseHandle = Database | Transaction`과 `getDatabaseConnection(handle)`이 이미 존재하고 Post service 일부도 선택적 handle을 받는다. 그러나 `packages/fedify`의 production federation은 `Federation<void>`이며, Web의 `federation.fetch()`는 `contextData: undefined`를 전달한다. 따라서 inbound Note 생성·삭제·Announce 및 URI lookup의 Post SQL은 전역 `db`를 선택하고 Web 요청의 database lifetime과 분리되어 있다.

PROD-710은 실제 Web trusted ingress callsite와 함께 최소 실행 경계를 도입한다. 최초 source는 기존 owner `DATABASE_URL`이고 PROD-715가 이후 같은 생성 seam의 source만 Worker SCRAM credential로 바꾼다.

## Goals / Non-Goals

**Goals:**

- Web federation 요청마다 명시적인 owner database와 close lifetime을 만든다.
- Fedify context가 database handle을 내부 listener/dispatcher에 전달한다.
- inbound Post/PostContent lookup과 core action을 같은 handle에 결속한다.
- transaction, savepoint, post-commit, 오류와 cleanup 동작을 회귀 테스트로 고정한다.

**Non-Goals:**

- database principal 또는 credential source 전환.
- role, VaultStaticSecret, Secret, object GRANT, Helm selector나 production apply.
- GraphQL operation database/RLS, Temporal Workflow/Activity, Fedify MessageQueue.
- Post와 무관한 모든 Fedify/Profile SQL의 일괄 이전.

## Implementation Guidance

### Current Constraints

- 하나의 production federation instance가 Web inbound, process 내부 outbound context 생성과 PROD-448 queue consumer에 함께 쓰인다. 공유 federation의 context는 항상 database를 명시적으로 받아야 하므로 Web은 request owner를, 제외된 outbound/API/queue caller는 기존 전역 owner `db`를 명시한다. 이 adapter plumbing은 해당 caller의 credential, SQL 또는 lifetime을 바꾸지 않는다.
- `createPost`, `deletePost`, `repostPost`는 transaction을 내부에서 열 수 있고 일부 action은 post-commit callback을 반환한다. caller transaction을 전달하면 callback은 outer commit 뒤 실행해야 하며 transaction을 post-commit lifetime으로 넘겨서는 안 된다.
- `activitypub-post-uri.ts`와 inbound handler의 direct Post mapping SQL이 전역 `db`를 사용하면 core action만 handle로 바꿔도 요청 경계 밖 SQL이 남는다.
- Web middleware는 federation 응답뿐 아니라 onNotFound/onUnauthorized fallthrough까지 await한 뒤 Hono 응답을 확정하므로, database close는 전체 `federation.fetch()` 호출을 감싸야 한다.

### Recommended Approach

- core DB module의 private primitive가 URL로 단일-client `Database`와 idempotent `close()`를 만들고, 공개 request-lifetime factory가 기존 owner `DATABASE_URL` source 선택까지 소유한다. GraphQL operation factory는 별도 `OPERATION_DATABASE_URL` 선택을 유지하면서 같은 private primitive를 조합한다.
- Fedify package 내부 context data에 필수 `db: Database`를 두고 production federation listener/dispatcher는 `context.data.db`를 직접 사용한다. Web은 request database를 전달하고 제외된 outbound/API/queue caller도 기존 전역 owner `db`를 명시해 누락 fallback을 만들지 않는다.
- Post/PostContent 관련 helper와 URI lookup은 필수 `DatabaseHandle`을 받고 전달된 handle을 직접 사용한다. core action에는 같은 handle을 전달한다.
- inbound handler가 outer transaction을 소유하는 경우 lookup, direct mapping SQL과 core action을 같은 transaction에 합류시키고, 반환된 post-commit callback은 transaction 성공 뒤 request `Database`로 실행한다.
- Web test는 injected factory 또는 adapter seam으로 success/error 모두 close를 검증하고 Fedify DB-backed tests는 explicit transaction composition과 rollback을 검증한다.

### Allowed Alternatives

- public Web adapter 대신 `federation.fetch()`에 context data를 직접 전달할 수 있다. 단, Web만 context shape를 만들고 모든 성공·오류·fallthrough 경로의 close를 소유하며 package-internal 타입이 불필요하게 공개되지 않아야 한다.
- 별도 request factory 없이 기존 single-client primitive를 내부에서 재사용할 수 있다. 단, GraphQL의 `OPERATION_DATABASE_URL`과 trusted ingress의 owner `DATABASE_URL` 선택은 각각의 공개 DB factory가 소유해야 하며 Web 호출부가 raw URL을 전달해서는 안 된다.

### Known Traps

- `WORKER_DATABASE_*`를 지금 읽거나 fallback source로 추가하면 PROD-715 credential 전환을 선점한다.
- core action에만 handle을 전달하고 URI lookup/direct mapping SQL을 전역 `db`에 남기면 transaction과 principal이 갈라진다.
- transaction 자체를 post-commit callback에 전달하면 commit 이후 lifetime과 충돌한다.
- production federation이 `undefined` context를 허용하거나 누락 handle을 전역 `db`로 대체하면 명시적 request lifetime을 우회하므로 허용하지 않는다. 제외된 caller도 기존 전역 owner를 사용한다는 선택을 context에 명시한다.

## Risks / Trade-offs

- [요청마다 single PostgreSQL client를 열고 닫아 connection churn이 늘어난다] → 현재 명시적 lifetime과 후속 Pooler cutover seam을 우선하고, max=1과 idempotent close를 유지한다.
- [Post SQL 일부가 inventory에서 누락될 수 있다] → production non-test import와 `Posts`/`PostContents`/`ActivityPubPosts`, Post service call을 함께 검색하고 explicit-handle 회귀 테스트를 둔다.
- [Fedify context 변경이 outbound delivery를 깨뜨릴 수 있다] → inbound adapter와 outbound context 생성 경계를 분리하거나 outbound에 안전한 명시적 context data를 제공하고 package 전체 typecheck/tests를 실행한다.

## Migration Plan

1. DB owner와 Fedify context/adapter를 additive하게 추가한다.
2. Web ingress와 Post/PostContent callsite를 같은 change에서 explicit handle로 연결한다.
3. 기존 owner `DATABASE_URL`에서 로컬/CI 회귀 테스트와 전체 관련 package 검증을 수행한다.
4. 코드만 독립 배포할 수 있으나 이번 작업에서 production sync/apply/cutover는 하지 않는다.
5. rollback은 이 코드 change를 되돌려 기존 전역 owner pool 경로로 복귀한다.

## Open Questions

없음.
