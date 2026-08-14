## Context

이 기록은 PROD-713의 GraphQL-only Post/PostContent RLS, 현재 Mutation 호환 DML, DIRECT interim, Tombstone 멱등성 및 Notification 후속 경계를 구현 가능한 선택으로 구체화한다. 역할·ACL·session writer·credential cutover와 production 운영은 각각의 독립 경계에 남는다.

## Decision Records

### RLS policy는 kosmo_api에만 적용하고 owner와 Worker 우회를 유지한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, PROD-713, PROD-369, PROD-724
- Status: Active
- Context / Problem: GraphQL 행 권한을 database에서 강제하면서 trusted non-GraphQL ingress와 Temporal Activity의 기존 SQL을 같은 policy로 제한하면 runtime ownership이 섞인다.
- Decision Outcome: `post`와 `post_content`는 RLS를 활성화하되 FORCE RLS는 비활성화하고 policy role은 `kosmo_api`로 한정한다. `kosmo_worker` policy는 만들지 않고 기존 BYPASSRLS를 유지한다.
- Alternatives Considered: `PUBLIC` policy나 Worker 전용 permissive policy는 GraphQL-only 범위를 넓히며 이미 선언된 BYPASSRLS 경계를 중복한다.
- Consequences: migration은 owner runtime에서 additive하게 배포할 수 있지만 실제 GraphQL enforcement 활성화는 PROD-716 cutover가 소유한다.
- Confirmation / Follow-up: PostgreSQL catalog에서 RLS/FORCE/roles를 확인하고 owner·Worker 결과를 실제 SQL로 검증한다.

### DIRECT는 author-only interim으로 고정한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-713, PROD-462
- Status: Active
- Context / Problem: canonical 최종 모델은 Mentioned Profile recipient를 포함하지만 recipient identity/materialization은 아직 구현되지 않았다.
- Decision Outcome: PROD-713의 DIRECT SELECT는 Author만 허용한다. Mentioned Profile recipient 확장은 PROD-462가 관계와 조회 policy를 함께 전달한 뒤 수행한다.
- Alternatives Considered: recipient 관계 없이 DIRECT를 공개하거나 추정된 mention으로 허용하면 canonical identity 없이 권한을 만든다. DIRECT 전체 거부는 작성자의 기존 접근을 깨뜨린다.
- Consequences: PROD-713 완료는 DIRECT recipient 지원 완료 증거가 아니다.
- Confirmation / Follow-up: author와 follower/stranger DIRECT matrix를 role-level로 검증하고 PROD-462 관계를 유지한다.

### 현재 GraphQL SQL에 필요한 최소 DML policy만 transition으로 제공한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, PROD-713, PROD-722, PROD-725, PROD-677, PROD-765
- Status: Active
- Context / Problem: PROD-716 cutover 전에 SELECT policy만 추가하면 현재 GraphQL create/reply/repost/delete가 non-owner principal에서 실패하지만, broad CRUD policy는 불필요한 command를 연다.
- Decision Outcome: `kosmo_api`에는 author-bound Post INSERT/UPDATE와 PostContent INSERT만 허용한다. Post physical DELETE와 PostContent UPDATE/DELETE policy는 만들지 않는다. 이 policy는 Temporal Post 쓰기 전환이 모두 완료된 뒤 PROD-765가 제거한다.
- Alternatives Considered: 모든 CRUD를 여는 policy는 현재 callsite보다 넓다. 쓰기 policy를 전혀 만들지 않는 선택은 현재 Mutation 호환성을 깨뜨린다.
- Consequences: skeleton Post → PostContent → Post link UPDATE와 Tombstone UPDATE가 동작하며 장기적으로 GraphQL read-only 목표를 위해 별도 contract 제거가 필요하다.
- Confirmation / Follow-up: 실제 core SQL 순서를 `SET ROLE kosmo_api`로 재현하고 불필요한 command가 거부되는지 검증한다.

### 작성자 Tombstone SELECT로 반복 삭제 의미를 유지한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, PROD-713
- Status: Active
- Context / Problem: Active-only SELECT는 author가 Tombstone UPDATE 후 `RETURNING`과 반복 삭제 확인에서 같은 row를 볼 수 없게 해 기존 멱등 의미를 바꾼다.
- Decision Outcome: eligible Author Profile은 자신의 Tombstone Post와 그 PostContent를 조회할 수 있고, 다른 viewer에게 Tombstone은 숨긴다.
- Alternatives Considered: 모든 Tombstone을 숨기면 구현은 단순하지만 기존 반복 delete가 Not Found로 변한다. 모든 viewer에게 Tombstone을 보이면 조회 범위를 과도하게 넓힌다.
- Consequences: Post SELECT policy에 author-only Tombstone branch가 필요하며 PostContent는 부모 정책을 그대로 따른다.
- Confirmation / Follow-up: author 반복 delete, 다른 viewer와 malformed actor의 Tombstone 음성 matrix를 검증한다.

### account-only context는 공개 viewer이며 Notification recipient context는 분리한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, PROD-713, PROD-726, PROD-766
- Status: Active
- Context / Problem: 일반 Post 조회에 Account의 모든 membership Profile을 viewer로 인정하면 selected Profile 외 private Post 권한이 넓어지지만, existing Notification은 여러 recipient Profile을 한 Account에서 조회한다.
- Decision Outcome: missing Profile 또는 account-only context는 anonymous와 같은 공개 Post만 조회한다. Notification recipient별 RLS execution은 PROD-766이 소유하고 PROD-716 cutover 전에 완료한다.
- Alternatives Considered: account membership 전체를 Post policy에 포함하면 Notification은 유지되지만 일반 Node/DIRECT 권한도 넓어진다. Notification을 selected Profile로 축소하면 기존 제품 동작이 바뀐다.
- Consequences: PROD-713 migration은 owner runtime에 독립 배포할 수 있으나 PROD-766 없이 `kosmo_api` principal cutover를 완료할 수 없다.
- Confirmation / Follow-up: account-only와 malformed actor가 private row를 보지 못하는지 검증하고 PROD-766이 PROD-716을 block하도록 유지한다.

### 순수 Repost source eligibility predicate는 application에 유지한다

- Decision Date: 2026-08-14
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, PROD-713, PROD-711
- Status: Active
- Context / Problem: 현재 GraphQL Post access는 순수 Repost의 source visibility도 확인한다. 같은 Post RLS policy에서 `post`를 다시 조회하면 same-table recursion 위험이 있다.
- Decision Outcome: PROD-713은 base viewer/author RLS만 제공하고 `postRepostSourceAccessWhere`를 유지한다. PROD-711도 recursion-safe 대체 contract 없이 이 predicate를 제거하지 않는다.
- Alternatives Considered: same-table subquery는 PostgreSQL RLS recursion 오류 위험이 있다. SECURITY DEFINER helper는 새로운 권한 경계라 이번 scope에서 승인되지 않았다.
- Consequences: RLS와 application predicate가 transition 동안 함께 동작하며 순수 Repost eligibility의 최종 database enforcement는 후속 결정이 필요할 수 있다.
- Confirmation / Follow-up: diff에서 source predicate가 유지되는지 확인하고 pure Repost GraphQL 회귀를 실행한다.

### test schema sync는 migration-defined prerequisite를 먼저 적용한다

- Decision Date: 2026-08-14
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/database-migrations.md`, PROD-370, PROD-713
- Status: Active
- Context / Problem: Drizzle schema metadata의 policy는 PROD-370 migration이 생성하는 `public.kosmo_current_profile_id()`를 참조한다. 빈 test database에 schema push만 실행하면 helper가 없어서 policy 생성이 실패한다.
- Decision Outcome: `db:test:push`는 production과 같은 migration chain을 먼저 적용한 뒤 Drizzle schema sync를 수행한다. 별도 test-only helper 복제나 runtime role/credential 생성을 policy migration에 넣지 않는다.
- Alternatives Considered: helper SQL을 test bootstrap에 복제하면 migration contract와 drift할 수 있다. policy에 actor parsing을 inline하면 canonical helper contract를 중복한다.
- Consequences: DB-backed test는 custom function·ACL·policy를 포함한 migration ordering을 함께 검증하며, schema sync는 그 뒤 현재 metadata drift를 확인한다.
- Confirmation / Follow-up: blank isolated database에서 migration tests, core service tests와 API integration tests를 공식 package script로 실행한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- GraphQL Post/PostContent 쓰기 policy를 이번 change에서 만들지 않고 모든 쓰기를 즉시 Temporal로 넘긴다는 2026-08-14 초안은 현재 direct Mutation 호환성을 깨뜨리므로 superseded되었다. 현재 최소 transition DML policy와 PROD-765 removal 계약이 이를 대체한다.
- account membership의 모든 Profile을 Post viewer로 인정해 Notification을 유지하는 선택은 일반 Post 권한을 넓히므로 superseded되었다. PROD-766의 recipient-specific execution 경계가 이를 대체한다.
