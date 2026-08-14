## Context

이 기록은 PROD-713의 GraphQL-only Post/PostContent RLS, 현재 Mutation 호환 DML, DIRECT interim, DELETED 전체 숨김 및 Notification 후속 경계를 구현 가능한 선택으로 구체화한다. 역할·ACL·session writer·credential cutover와 production 운영은 각각의 독립 경계에 남는다.

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

### Post/PostContent DML command를 permissive transition policy로 함께 연다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, PROD-713, PROD-722, PROD-725, PROD-677, PROD-765
- Status: Active
- Context / Problem: PROD-716 cutover 전에 SELECT policy만 추가하면 현재 또는 미확인 GraphQL Mutation이 non-owner principal에서 실패할 수 있다. callsite별 actor-bound policy는 전환 중 쉽게 누락되고 곧 Temporal로 제거될 계약에 복잡성을 더한다.
- Decision Outcome: 각 table에 permissive `FOR ALL USING (true) WITH CHECK (true)` transition policy 하나와 restrictive `FOR SELECT` viewer policy 하나를 둔다. PostgreSQL이 이를 `AND`로 결합해 SELECT 범위를 유지하면서 DML command를 함께 허용하고, Temporal Post 쓰기 전환이 모두 완료된 뒤 PROD-765가 `FOR ALL` policy를 제거한다.
- Alternatives Considered: 현재 확인된 callsite만 actor-bound로 허용하면 최소 권한이지만 아직 확인되지 않은 Mutation을 막을 수 있다. 쓰기 policy를 전혀 만들지 않으면 현재 Mutation 호환성이 깨진다.
- Consequences: 전환 기간 `FOR ALL` predicate 자체는 actor를 제한하지 않지만 `WHERE`나 `RETURNING`으로 row를 읽는 UPDATE/DELETE에는 restrictive SELECT가 함께 적용된다. 특히 ACTIVE→DELETED `RETURNING`은 거부되므로 실제 delete lifecycle은 PROD-677 Temporal Workflow가 소유하고 PROD-716의 선행 조건으로 남는다.
- Confirmation / Follow-up: 실제 `SET ROLE kosmo_api`에서 catalog 조합, 일반 viewer matrix, visible Active row의 DML과 ACTIVE→DELETED 거부를 검증하고 PROD-677/765 경계를 유지한다.

### DELETED Post와 PostContent는 작성자에게도 숨긴다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, PROD-713
- Status: Active
- Context / Problem: 작성자 Tombstone SELECT를 유지하면 GraphQL RLS가 Temporal이 소유할 실제 삭제 lifecycle의 호환 상태까지 떠안는다.
- Decision Outcome: DELETED Post와 그 PostContent는 작성자를 포함한 모든 `kosmo_api` viewer에게 숨긴다. 반복 delete가 Not Found로 바뀌는 것을 허용하고 실제 삭제 lifecycle과 물리 정리는 Temporal Workflow/Activity가 소유한다.
- Alternatives Considered: 작성자에게만 Tombstone SELECT를 허용하면 기존 반복 delete 멱등성을 보존할 수 있지만 GraphQL RLS의 책임이 늘어난다. 모든 viewer에게 허용하면 조회 범위가 과도하게 넓어진다.
- Consequences: Post SELECT policy는 Active row만 허용하고 author-only DELETED branch를 두지 않는다. PostContent는 부모 정책을 따라 함께 숨겨진다.
- Confirmation / Follow-up: author/follower/anonymous가 DELETED Post/PostContent를 조회하지 못하고 DML transition policy가 SELECT 범위를 넓히지 않는지 검증한다.

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

- GraphQL Post/PostContent 쓰기 policy를 이번 change에서 만들지 않고 모든 쓰기를 즉시 Temporal로 넘긴다는 2026-08-14 초안은 현재 direct Mutation 호환성을 깨뜨리므로 superseded되었다. 각 table의 permissive `FOR ALL` transition policy와 PROD-765 removal 계약이 이를 대체한다.
- permissive command별 DML policy 여섯 개는 같은 결과를 더 많은 객체로 표현하므로 superseded되었다. permissive `FOR ALL`과 restrictive SELECT의 table당 두 policy 조합이 이를 대체한다.
- 확인된 GraphQL callsite만 author-bound로 허용하고 Post physical DELETE와 PostContent UPDATE/DELETE를 막는 초기 구현은 전환 중 미확인 Mutation을 막을 수 있어 superseded되었다.
- account membership의 모든 Profile을 Post viewer로 인정해 Notification을 유지하는 선택은 일반 Post 권한을 넓히므로 superseded되었다. PROD-766의 recipient-specific execution 경계가 이를 대체한다.
