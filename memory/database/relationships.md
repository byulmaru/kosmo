# Database Design: Relationships

## Relationship Modeling

- Use explicit join tables when an N:N relationship has role, state, order, timestamp, or permissions.
- Put relationship-context values on the join table.
- For ordinary N:N relationships, post-specific context belongs on the relationship. Post Content Media is an explicit
  exception defined by canonical ADR 0022: revision-specific Media references, order, alt text and sensitivity live in
  the versioned `post_content.document` Media nodes without a duplicate join table.
- Avoid polymorphic foreign keys in the initial schema. Prefer explicit relationship tables.
- Add ActivityPub actor details, inbox/outbox queues, and AT Protocol record/cache tables after the implementation path is concrete.

### Notification Projection Exception

Profile-scoped Notification은 여러 source의 사용자용 projection이므로 일반적인 polymorphic
relationship 금지 규칙에 다음 한정 예외를 둔다.

- `notification` 하나에 `kind` enum과 `source_id uuid`를 저장하며 `source_id`에는 의도적으로 foreign
  key를 만들지 않는다. `kind`가 실제 source table과 application validation을 결정한다.
- 명확한 소유 관계인 `recipient_profile_id`는 `profile.id` foreign key와 물리 삭제 cascade를 유지한다.
- source 중복은 `(recipient_profile_id, kind, source_id)` unique constraint로 막고, 정상 source
  생성·삭제 action이 Notification 저장·정리를 호출한다. 같은 source가 여러 Recipient에게 투영되는 kind를
  허용한다. source-only cleanup용 `(kind, source_id)` index는 선제 추가하지 않고 실제 조회 경로가 이를
  요구할 때 별도 migration으로 결정한다.
- `data jsonb`는 kind별 최소 추가 데이터만 저장한다. 범용 payload framework나 GIN index를 선제 추가하지
  않으며 Follow는 `{}`를 사용하고 Profile ID·이름·handle snapshot을 복제하지 않는다.
- loose source가 없어지거나 Related Profile을 Recipient 기준으로 조회할 수 없으면 API는 해당 item을 목록,
  count, Node와 Read에서 숨긴다. 장기 비동기 물리 정리는 별도 capability가 소유한다.
- 이 예외를 다른 domain relationship의 generic polymorphic association 근거로 확장하지 않는다.
- Account-scoped Operational Notification의 저장 구조는 해당 kind를 구현하는 별도 change에서 결정한다.

Drizzle query policy:

- Use Drizzle's SQL-like query builder with explicit `select`, `from`, and `join` clauses.
- Do not define a Drizzle relation schema while the project does not use the relational query API (`db.query.*`).
- Define database foreign keys in `packages/core/db/tables.ts` with `.references()`; relation metadata is not a substitute for database constraints.
- If a future change adopts the relational query API, introduce only the relation definitions required by concrete query paths and update this policy in the same change.

## Runtime Locking Policy

- Application use cases must not add explicit pessimistic locks such as `SELECT ... FOR UPDATE`, table locks,
  or advisory locks merely to make every concurrent outcome perfectly serialized.
- Use an explicit lock only when a concrete race can violate a critical invariant and the resulting damage is severe or
  difficult to reverse, such as duplicate financial settlement, overspending a balance, or another transaction with
  equivalent correctness requirements.
- Prefer database constraints, atomic conditional `INSERT`/`UPDATE`/`DELETE`, upsert/conflict handling, idempotency
  keys, and bounded retry before considering a lock. A short transaction and the locks PostgreSQL acquires inherently
  while executing normal DML are not prohibited by this policy.
- Social interactions whose rare race is benign or repairable should favor availability and simpler code over strict
  serialization. In particular, Follow Request creation, acceptance, rejection, or cancellation must not lock the
  participant Profile or Follow Request rows solely to preserve perfect request consistency; use uniqueness and atomic
  writes and tolerate a harmless concurrent winner instead.
- A PR that introduces an explicit lock must explain the protected invariant, the exact race and user/business impact,
  why constraint/atomic/idempotent approaches are insufficient, the smallest lock scope and stable acquisition order,
  and how lock duration, deadlock, timeout, and concurrent behavior were verified.
- Infrastructure coordination locks with a separate operational purpose, such as the migration runner advisory lock,
  are reviewed under that workflow and are not precedent for adding locks to product use cases.
