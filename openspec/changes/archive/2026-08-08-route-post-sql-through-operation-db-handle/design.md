## Context

PROD-708은 각 GraphQL operation context에 `ctx.db`를 추가했지만 현재 값은 기존 global Drizzle database다. Post resolver와 loader는 `@kosmo/core/db`의 `db`를 직접 import하고, Post mutation이 호출하는 core service는 optional `Transaction`을 생략하면 global DB로 fallback한다. 이 상태에서는 PROD-726이 `ctx.db`를 operation별 session handle로 바꿔도 Post SQL 일부가 그 session을 벗어난다.

Post API call graph에는 Post/PostContent 자체뿐 아니라 Profile.posts, reply/repost projection, bookmark/reaction과 notification source projection, core action의 domain transaction과 savepoint가 포함된다. 반면 ActivityPub ingress와 Post 외 GraphQL consumer의 전체 정렬은 각각 기존 system 경계와 PROD-726 범위이므로 이번 change가 session lifecycle을 활성화해서는 안 된다.

## Goals / Non-Goals

**Goals:**

- production GraphQL Post call graph의 직접 query와 loader가 `ctx.db`를 사용한다.
- resolver가 Post 관련 core action에 명시적 database handle을 전달한다.
- core action의 기존 transaction/savepoint와 post-commit 순서를 유지한다.
- 전역 DB import와 handle 생략을 정적 검증하고 기존 API 회귀 테스트를 유지한다.

**Non-Goals:**

- operation별 connection, actor GUC 또는 operation-wide transaction을 만들지 않는다.
- Post 외 Account/Profile/Media/Hashtag/Session/Feedback consumer 전체를 이전하지 않는다.
- 권한 predicate, 목록·pagination, RLS policy·grant, endpoint 또는 credential을 변경하지 않는다.
- schema나 migration을 변경하지 않는다.

## Implementation Guidance

### Current Constraints

`Context.db`는 현재 `Database` 타입이며 core service의 optional `Transaction`과 직접 호환되는 공통 이름이 없다. direct resolver SQL을 `ctx.db`로 바꾸는 것만으로는 core action과 post-commit notification query가 global fallback을 계속 사용할 수 있다. Post 접근 predicate도 `exists` subquery를 global builder로 구성하므로 Post resolver slice에서 global `db` import를 완전히 제거하려면 predicate가 operation handle을 사용해야 한다.

### Recommended Approach

Drizzle `Database | Transaction`을 표현하는 `DatabaseHandle` 타입을 core DB 경계에 추가하고 `Context.db`가 이 타입을 사용하게 한다. Post 관련 core action은 전달받은 handle에서 기존 domain transaction을 열거나 전달받은 transaction에 합류한다. API resolver는 모든 direct Post SQL과 access subquery를 `ctx.db`로 구성하고 mutation은 같은 handle을 core action 및 post-commit SQL에 전달한다.

Post·bookmark·reaction resolver와 Post notification projection에는 `@kosmo/core/db`의 named `db` import를 금지하는 정적 경계를 두어 신규 fallback을 차단한다. 기존 integration test는 응답·권한·transaction/savepoint 의미를 검증하고, focused unit/static test는 handle 전달을 확인한다.

### Allowed Alternatives

동일한 spec을 만족한다면 `DatabaseHandle`을 별도 모듈에서 export하거나 access predicate가 `ctx` 대신 handle을 직접 받을 수 있다. public GraphQL 또는 core domain 결과를 바꾸지 않아야 한다.

### Known Traps

- resolver의 마지막 query만 `ctx.db`로 바꾸고 `exists` subquery, loader 또는 core service fallback을 남기면 future operation session 밖에서 SQL이 실행된다.
- operation 전체를 transaction으로 감싸거나 core의 기존 domain transaction을 제거하면 PROD-726 제외 범위와 기존 atomicity를 위반한다.
- post-commit SQL에 이미 종료된 future session handle을 사용하지 않도록 resolver가 `postCommit()`을 await한 뒤 operation handle lifecycle이 끝나는 현재 순서를 유지해야 한다.
- ActivityPub caller를 제거하거나 API credential·endpoint를 바꾸는 방식으로 타입 오류를 해결하지 않는다.

## Risks / Trade-offs

- [정적 import 경계가 Post와 결합된 bookmark/reaction 파일까지 포함한다] → 이 도메인들의 production GraphQL SQL은 Post 조회·변경 계약의 일부이므로 함께 `ctx.db`로 이전하되 notification의 비Post consumer 전체 이전은 피한다.
- [현재 `ctx.db === db`라 runtime 결과만으로 fallback 누락을 발견하기 어렵다] → named global import 금지와 required handle type, focused tests를 함께 사용한다.
- [core service는 ActivityPub 등 non-GraphQL caller도 공유한다] → 기존 caller는 명시적으로 현재 DB/transaction을 전달해 행동을 유지하고 operation session 활성화는 하지 않는다.

## Migration Plan

1. `DatabaseHandle` 타입과 Post call graph의 명시적 handle 전달을 추가한다.
2. Post 관련 resolver/loader/access query를 `ctx.db`로 이전하고 정적 fallback 검증을 추가한다.
3. typecheck, lint와 Post/bookmark/reaction/notification integration test로 행동 호환성을 확인한다.
4. 현재 direct endpoint와 owner credential 상태로 독립 배포한다.
5. 회귀 시 이 코드 변경만 rollback한다. database schema, Pooler와 credential은 바뀌지 않으므로 별도 데이터 rollback은 없다.

## Open Questions

없음.
