## 1. PROD-371 Core Post database handle

**Authority / Provenance**

- `docs/architecture/core-services.md`
- PROD-371

**Deliverable**

Post와 결합된 core action이 caller의 명시적 database handle에서 기존 transaction, savepoint와 post-commit SQL을 실행한다.

**Guardrails**

- 기존 domain transaction·savepoint·post-commit 순서와 public domain 결과를 유지한다.
- operation-wide transaction이나 새 connection을 만들지 않는다.

**Verification**

- core typecheck와 Post/bookmark/reaction/notification service 회귀 테스트로 handle 전달과 rollback 의미를 검증한다.

- [x] 1.1 Database와 Transaction을 포괄하는 명시적 handle 경계를 제공한다.
- [x] 1.2 Post/bookmark/reaction core action과 Post notification projection이 caller handle을 사용하도록 정렬한다.
- [x] 1.3 공유 core caller가 기존 database 또는 transaction을 명시적으로 전달하고 행동을 유지하게 한다.

## 2. PROD-371 GraphQL Post consumer 정렬

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- PROD-371

**Deliverable**

production GraphQL의 모든 Post/PostContent 조회·변경 SQL과 결합 projection이 해당 operation의 `ctx.db`를 사용한다.

**Guardrails**

- 기존 권한 predicate, 목록 후보·정렬·pagination, GraphQL schema와 응답을 유지한다.
- Post 외 GraphQL consumer 전체 이전과 session/GUC/RLS/credential 활성화를 포함하지 않는다.

**Verification**

- Post call graph 정적 인벤토리에서 전역 DB fallback이 없음을 확인한다.
- Post, repost, reply, bookmark, reaction과 notification integration test로 기존 결과를 검증한다.

- [x] 2.1 Post/PostContent Node, list, reply/repost field와 loader SQL을 `ctx.db`로 이전한다.
- [x] 2.2 bookmark·reaction과 notification source projection의 Post SQL을 `ctx.db`로 이전한다.
- [x] 2.3 Post create/reply/repost/delete와 결합 mutation이 같은 handle을 core action에 전달하게 한다.

## 3. PROD-371 검증과 전달

**Authority / Provenance**

- `docs/architecture/core-services.md`
- PROD-371

**Deliverable**

handle 전환이 독립 배포·rollback 가능하고 기존 동작을 보존한다는 검증 근거를 제공한다.

**Guardrails**

- API/Web database endpoint·credential, PgBouncer, actor GUC, RLS policy·grant와 schema/migration을 변경하지 않는다.

**Verification**

- typecheck, lint, focused unit/integration test, strict OpenSpec validation과 diff invariant를 통과한다.
- 배포 manifest/config와 database migration diff가 없음을 확인한다.

- [x] 3.1 신규 global DB fallback을 차단하는 정적 검증과 focused handle 회귀 테스트를 추가한다.
- [x] 3.2 전체 affected test·typecheck·lint와 OpenSpec strict validation을 통과시킨다.
- [x] 3.3 self-review에서 PROD-726/PROD-716 제외 범위와 독립 rollback 경계를 확인한다.
