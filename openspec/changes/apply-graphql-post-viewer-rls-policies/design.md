## Context

현재 GraphQL Post/PostContent loader와 목록 SQL은 애플리케이션 predicate로 Active Post, Author Profile/Instance eligibility, PUBLIC/UNLISTED, author와 established follower를 판정한다. PROD-370은 nullable UUID actor helper를 제공하고 PROD-726은 operation connection에 Account/Profile setting을 공급하지만, `post`와 `post_content`에는 아직 RLS가 없다.

현재 GraphQL create/reply/repost/delete는 같은 operation DB handle에서 Post/PostContent DML을 직접 수행하며 아직 모든 callsite가 Temporal로 이전되지 않았다. non-owner cutover 전에 SELECT policy만 추가하면 create/reply/repost와 미확인 Active-row Mutation이 깨질 수 있으므로, 전환 기간에는 두 table의 DML command를 함께 여는 호환성을 우선한다. ordinary delete의 ACTIVE→DELETED `RETURNING`은 restrictive SELECT와 양립하지 않으므로 PROD-677 Temporal 전환 뒤에만 principal cutover한다.

Notification GraphQL은 operation selected Profile과 다른 recipient Profile을 viewer로 사용할 수 있어 단일 Profile setting만으로는 기존 account-wide 목록을 보존하지 못한다. 이 문제는 PROD-766이 PROD-716 cutover 전에 별도로 해결하며, PROD-713 정책을 Account의 모든 membership으로 넓히지 않는다.

## Goals / Non-Goals

**Goals:**

- `kosmo_api`에 Post/PostContent viewer RLS와 INSERT/UPDATE/DELETE 전체를 허용하는 임시 DML 호환 policy를 제공한다.
- missing/malformed actor context, 다른 actor와 direct PostContent ID 접근을 fail-closed로 처리한다.
- DELETED Post/PostContent는 작성자에게도 숨기고 반복 delete의 Not Found 변화를 허용한다.
- owner와 `kosmo_worker` BYPASSRLS 결과를 보존하고 기존 index로 policy 경로를 검증한다.

**Non-Goals:**

- DIRECT recipient, Notification recipient context, 순수 Repost source predicate 또는 application predicate 제거
- Temporal Workflow/Activity 전환과 전환 후 DML policy 제거
- role credential, object ACL, GraphQL connection lifecycle와 production principal cutover
- speculative index와 production sync/apply/live 검증

## Implementation Guidance

### Current Constraints

- `post` INSERT는 current content가 없는 skeleton을 먼저 만들고, `post_content` INSERT 뒤 `post.current_content_id`와 optional reply parent를 UPDATE한다. INSERT policy가 current content 존재를 요구하면 정상 create/reply가 실패한다.
- DML policy는 actor setting과 무관한 permissive transition 경계다. SELECT viewer policy나 실제 삭제 lifecycle 소유권을 넓히지 않으며 물리 정리는 Temporal Workflow/Activity가 소유한다.
- PostContent의 viewer 판정은 부모 Post와 같아야 한다. PostContent 자체 column만으로 visibility를 판단할 수 없다.
- Post SELECT policy 안에서 순수 Repost source를 같은 `post` table subquery로 다시 조회하면 same-table RLS recursion을 만들 수 있다. 이 조건은 현재 application predicate에 남긴다.
- RLS는 command policy와 object ACL을 모두 통과해야 한다. PROD-724의 broad CRUD ACL은 유지하되 RLS policy가 행 경계를 좁힌다.

### Recommended Approach

Drizzle table metadata에 RLS와 `TO kosmo_api` policy를 선언하고, 생성된 migration에서 다음 구조를 확인한다.

1. Post SELECT policy는 `AS RESTRICTIVE FOR SELECT`로 Author Profile/Instance를 correlated `EXISTS`로 확인하고 Active row에만 PUBLIC/UNLISTED·author·established follower를 허용한다. FOLLOWERS membership은 현재 viewer의 `profile_follow.followee_profile_id` 집합에 대한 `IN` subquery로 표현해 다량 Post 조회에서 set-oriented plan을 허용한다. DIRECT는 author branch로만 통과하고 DELETED row는 모든 `kosmo_api` viewer에게 숨긴다.
2. 각 table에 `AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true)` transition policy 하나를 둬 INSERT/UPDATE/DELETE command를 함께 허용하고 restrictive SELECT policy가 적용될 permissive 기반도 제공한다.
3. PostgreSQL은 같은 command의 permissive 결과와 restrictive 결과를 `AND`로 결합한다. 일반 SELECT는 `true AND viewer predicate`로 제한되며, `WHERE`나 `RETURNING` 때문에 SELECT 권한이 필요한 UPDATE/DELETE에도 restrictive SELECT가 함께 적용된다.
4. PostContent SELECT는 부모 Post를 참조하는 `EXISTS`를 사용하고 부모 Post의 RLS 결과를 소비한다. 이 방식은 visibility SQL을 두 table에 복사하지 않고 Post 정책 변경을 함께 반영한다.
5. 두 policy는 `TO kosmo_api`에만 적용하고 실제 catalog와 command matrix를 자동 검증한다. PROD-677은 delete 전이를 Temporal로 옮기고, 전체 Temporal 전환 완료 뒤 PROD-765가 두 `FOR ALL` transition policy를 제거한다.

Policy DDL은 `post`를 먼저, `post_content`를 다음 순서로 적용해 application create flow와 일치하는 table lock 순서를 유지한다. 기존 Profile/Instance PK, `profile_follow(follower_profile_id, followee_profile_id)` unique index와 `post_content(post_id)` index를 우선 사용하고 실제 plan 근거 없이 index를 추가하지 않는다.

자동 검증은 기존 isolated `scripts/test-db.mjs run` 경로와 `packages/core/db/*.migration.test.mjs` 수집 규약을 사용한다. `db:test:push`는 migration-defined actor helper와 policy DDL을 실제 순서로 준비한 뒤 Drizzle schema sync를 수행한다. catalog 문자열만 비교하지 않고 실제 `SET ROLE kosmo_api`와 transaction-local actor settings로 SELECT/DML을 실행한다.

### Allowed Alternatives

- PostContent SELECT policy는 부모 Post policy와 완전히 같은 predicate를 직접 전개할 수도 있다. 다만 두 policy parity, DIRECT 후속 확장과 eligibility 조건이 독립적으로 drift하지 않는다는 검증이 있어야 한다.
- 동등한 Drizzle metadata 표현과 hand-written migration SQL을 사용할 수 있다. snapshot, catalog와 실제 policy 결과가 spec을 만족해야 한다.

### Known Traps

- `TO PUBLIC`, policy role 생략 또는 `kosmo_worker` policy 추가는 GraphQL-only 경계를 넓힌다.
- Profile helper의 `NULL`을 wildcard처럼 처리하면 account-only/malformed context가 private Post 권한을 얻는다.
- Post INSERT policy에서 `current_content_id IS NOT NULL`을 요구하면 skeleton-first create가 실패한다.
- permissive DML은 행별 actor authorization을 제공하지 않는다. 장기 권한 모델로 오해하거나 PROD-765 제거 조건 없이 남겨서는 안 된다.
- Active-only SELECT 때문에 반복 delete가 Not Found로 바뀌는 것은 승인된 contract이며, 실제 삭제 lifecycle을 GraphQL RLS에 되돌려 넣지 않는다.
- Post policy가 같은 Post table을 source visibility 확인용으로 조회하면 infinite recursion 오류가 발생할 수 있다.
- Notification 회귀를 피하려고 Account membership 전체를 viewer로 인정하면 일반 Post Node/DIRECT 권한이 넓어진다.
- migration/CI 성공을 실제 `kosmo_api` workload cutover 또는 production 승인으로 해석하면 안 된다.

## Risks / Trade-offs

- [DELETED row를 작성자에게도 숨기면 반복 delete 결과가 달라진다] → Not Found 변화를 승인하고 실제 삭제 lifecycle과 물리 정리는 Temporal Workflow/Activity에 남긴다.
- [호환 DML policy는 행별 actor 경계를 제공하지 않는 넓은 권한이다] → principal cutover 호환성을 위해 두 table의 세 command를 의도적으로 함께 열고 removal owner를 PROD-765로 고정한다.
- [PostContent parent subquery는 plan cost를 추가한다] → 기존 FK/index와 PK lookup plan을 확인하고 증명된 병목이 없으면 index를 추가하지 않는다.
- [Notification은 policy 배포 후 `kosmo_api` cutover 시 회귀할 수 있다] → migration은 owner runtime에서 additive하게 배포하고 PROD-766 완료 전 PROD-716 cutover를 금지한다.
- [순수 Repost source eligibility는 아직 application predicate에 남는다] → 해당 predicate를 PROD-713/711에서 제거하지 않고 별도 recursion-safe contract 전까지 유지한다.

## Migration Plan

1. schema metadata, additive policy migration과 snapshot을 같은 변경으로 추가한다.
2. blank database replay와 isolated PostgreSQL role matrix에서 catalog, SELECT, DML, owner/Worker bypass와 plan을 검증한다.
3. migration을 비운영에 배포하더라도 workload owner credential 상태에서는 behavior activation 완료로 보지 않는다.
4. PROD-766이 Notification recipient context를 완료한 뒤 PROD-716이 별도 principal cutover와 live parity를 소유한다.
5. cutover 전 rollback이 필요하면 새 forward migration으로 PostContent/Post policy를 제거하고 RLS를 비활성화한다. 이미 적용된 migration history를 수정하지 않는다.

## Open Questions

없음.
