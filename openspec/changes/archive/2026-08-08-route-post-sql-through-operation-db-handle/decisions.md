## Context

이 기록은 PROD-371의 Post API SQL handle 전환과 완료된 PROD-708 seam, 후속 PROD-726 session 활성화 경계를 반영한다.

## Decision Records

### Post GraphQL call graph는 하나의 operation handle을 명시적으로 전달한다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-371
- Status: Active
- Context / Problem: Post resolver의 직접 query만 `ctx.db`로 바꿔도 loader, access subquery, core action과 notification projection이 global DB를 사용하면 future operation session 밖에서 Post SQL이 실행된다.
- Decision Outcome: Post/PostContent Node·list·field·mutation과 결합된 bookmark·reaction·notification projection은 operation `ctx.db`를 직접 사용하거나 같은 operation `Database`를 core action에 전달한다. 같은 SQL statement의 Post visibility subquery를 포함하는 notification query도 operation handle에서 실행한다. GraphQL post-commit SQL은 같은 operation `Database`를 받고, caller-owned transaction을 사용하는 Fedify 경로는 outer commit 후 no-arg fallback을 호출한다.
- Alternatives Considered: 직접 Post table import가 있는 query만 이전하면 간접 call graph와 같은 statement의 visibility subquery가 누락된다. 모든 GraphQL 도메인을 함께 이전하면 PROD-726의 독립 범위를 가져온다.
- Consequences: Post와 결합된 projection 파일의 비Post column/query 일부도 같은 operation handle에서 실행될 수 있지만 새 connection은 열지 않으며 결과는 동일하다.
- Confirmation / Follow-up: Post call graph 검토, API integration test와 GraphQL `PostCommit(Database)`·Fedify outer-commit no-arg 회귀 검증으로 확인한다.

### Core Post action은 DatabaseHandle을 받되 기존 domain transaction을 유지한다

- Decision Date: 2026-08-08
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-371
- Status: Active
- Context / Problem: 현재 core Post/bookmark/reaction action은 caller-owned `Transaction`에 합류할 수 있어야 하지만 GraphQL operation context와 post-commit lifecycle이 transaction을 받아서는 안 된다.
- Decision Outcome: `Database | Transaction` 공통 `DatabaseHandle`은 core action 입력에 유지한다. GraphQL `Context.db`와 `PostCommit` invocation handle은 `Database`로 제한하고, API Post mutation은 operation `ctx.db`를 core action과 post-commit SQL에 전달한다. action의 기존 domain transaction/savepoint는 전달받은 `DatabaseHandle`에서 유지하며, caller-owned transaction을 사용하는 Fedify 경로는 outer commit 후 no-arg `postCommit()` fallback을 호출한다.
- Alternatives Considered: 모든 core action을 operation-wide transaction으로 호출하면 새로운 atomicity를 만들고 제외 범위를 위반한다. GraphQL 전용 core wrapper는 transport-neutral 경계와 중복을 만든다.
- Consequences: 공유 core caller는 action에 현재 Database 또는 Transaction을 명시해야 하지만 post-commit callback에는 Transaction을 전달할 수 없다. GraphQL의 future PROD-726 session-bound Database는 callback에 계속 전달할 수 있고, Fedify의 no-arg fallback은 outer commit 이후에만 허용된다. 기존 transaction·savepoint·post-commit 순서는 유지된다.
- Confirmation / Follow-up: typecheck와 core/API transaction·rollback 회귀 테스트, `PostCommit`의 Database-only 호출 및 Fedify outer-commit no-arg 회귀로 확인한다.

### 이 slice에서는 operation session을 활성화하지 않는다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: PROD-371, PROD-726, PROD-716
- Status: Active
- Context / Problem: Post consumer만 정렬된 상태에서 `ctx.db`를 전용 connection으로 바꾸면 Post 외 resolver가 global DB로 빠져 actor state와 connection lifecycle이 분리된다.
- Decision Outcome: `ctx.db`의 runtime 기본값은 기존 global `Database`로 유지하고, future operation session도 `Database` handle로만 주입한다. database endpoint와 credential은 그대로 유지한다. 모든 GraphQL consumer 정렬, PgBouncer client session과 actor GUC는 PROD-726이, credential 전환은 PROD-716이 소유한다.
- Alternatives Considered: Post operation만 선택적으로 session을 활성화할 metadata와 완전한 nested consumer 증거가 없으므로 부분 활성화를 제외한다.
- Consequences: 이번 배포는 구조적 handle 전환만 제공하고 RLS enforcement나 connection 수 변화는 만들지 않는다.
- Confirmation / Follow-up: manifest/config 무변경과 operation context 회귀 테스트로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
