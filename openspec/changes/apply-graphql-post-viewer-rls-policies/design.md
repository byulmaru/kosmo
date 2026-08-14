## Context

현재 GraphQL Post/PostContent loader와 목록 SQL은 애플리케이션 predicate로 Active Post, Author Profile/Instance eligibility, PUBLIC/UNLISTED, author와 established follower를 판정한다. PROD-370은 nullable UUID actor helper를 제공하고 PROD-726은 operation connection에 Account/Profile setting을 공급하지만, `post`와 `post_content`에는 아직 RLS가 없다.

현재 GraphQL create/reply/repost/delete는 같은 operation DB handle에서 `post` INSERT/UPDATE와 `post_content` INSERT를 직접 수행한다. ordinary delete도 physical DELETE가 아니라 `post.state`와 `deleted_at` UPDATE다. 따라서 non-owner cutover 전에 SELECT만 추가하면 Mutation이 깨지고, 필요 이상으로 physical DELETE/PostContent UPDATE policy를 열면 최소 권한을 잃는다.

Notification GraphQL은 operation selected Profile과 다른 recipient Profile을 viewer로 사용할 수 있어 단일 Profile setting만으로는 기존 account-wide 목록을 보존하지 못한다. 이 문제는 PROD-766이 PROD-716 cutover 전에 별도로 해결하며, PROD-713 정책을 Account의 모든 membership으로 넓히지 않는다.

## Goals / Non-Goals

**Goals:**

- `kosmo_api`에 Post/PostContent viewer RLS와 현재 GraphQL SQL에 필요한 최소 DML 호환 policy를 제공한다.
- missing/malformed actor context, 다른 actor와 direct PostContent ID 접근을 fail-closed로 처리한다.
- 작성자 Tombstone 조회와 UPDATE `RETURNING`을 허용해 기존 반복 삭제 의미를 유지한다.
- owner와 `kosmo_worker` BYPASSRLS 결과를 보존하고 기존 index로 policy 경로를 검증한다.

**Non-Goals:**

- DIRECT recipient, Notification recipient context, 순수 Repost source predicate 또는 application predicate 제거
- Temporal Workflow/Activity 전환과 전환 후 DML policy 제거
- role credential, object ACL, GraphQL connection lifecycle와 production principal cutover
- speculative index와 production sync/apply/live 검증

## Implementation Guidance

### Current Constraints

- `post` INSERT는 current content가 없는 skeleton을 먼저 만들고, `post_content` INSERT 뒤 `post.current_content_id`와 optional reply parent를 UPDATE한다. INSERT policy가 current content 존재를 요구하면 정상 create/reply가 실패한다.
- Post UPDATE는 Active row를 Tombstone으로 바꾼 뒤 `RETURNING`한다. SELECT policy가 작성자의 Tombstone을 숨기면 UPDATE 결과와 반복 삭제가 달라진다.
- PostContent의 viewer 판정은 부모 Post와 같아야 한다. PostContent 자체 column만으로 visibility를 판단할 수 없다.
- Post SELECT policy 안에서 순수 Repost source를 같은 `post` table subquery로 다시 조회하면 same-table RLS recursion을 만들 수 있다. 이 조건은 현재 application predicate에 남긴다.
- RLS는 command policy와 object ACL을 모두 통과해야 한다. PROD-724의 broad CRUD ACL은 유지하되 RLS policy가 행 경계를 좁힌다.

### Recommended Approach

Drizzle table metadata에 RLS와 `TO kosmo_api` policy를 선언하고, 생성된 migration에서 다음 구조를 확인한다.

1. Post SELECT policy는 Author Profile/Instance를 correlated `EXISTS`로 확인하고, Active row에는 PUBLIC/UNLISTED·author·established follower를 허용한다. DIRECT는 author branch로만 통과한다. 별도 branch에서 author의 Tombstone을 허용한다.
2. Post INSERT는 `WITH CHECK (profile_id = public.kosmo_current_profile_id())`로 skeleton을 허용한다.
3. Post UPDATE는 같은 author 조건을 `USING`과 `WITH CHECK`에 사용해 기존 row와 변경 후 row의 author identity를 고정한다.
4. PostContent SELECT는 부모 Post를 참조하는 `EXISTS`를 사용하고 부모 Post의 RLS 결과를 소비한다. 이 방식은 visibility SQL을 두 table에 복사하지 않고 Post 정책 변경을 함께 반영한다.
5. PostContent INSERT는 부모 Post의 author가 current Profile인지 확인한다. Post physical DELETE와 PostContent UPDATE/DELETE policy는 선언하지 않는다.

Policy DDL은 `post`를 먼저, `post_content`를 다음 순서로 적용해 application create flow와 일치하는 table lock 순서를 유지한다. 기존 Profile/Instance PK, `profile_follow(follower_profile_id, followee_profile_id)` unique index와 `post_content(post_id)` index를 우선 사용하고 실제 plan 근거 없이 index를 추가하지 않는다.

자동 검증은 기존 isolated `scripts/test-db.mjs run` 경로와 `packages/core/db/*.migration.test.mjs` 수집 규약을 사용한다. `db:test:push`는 migration-defined actor helper와 policy DDL을 실제 순서로 준비한 뒤 Drizzle schema sync를 수행한다. catalog 문자열만 비교하지 않고 실제 `SET ROLE kosmo_api`와 transaction-local actor settings로 SELECT/DML을 실행한다.

### Allowed Alternatives

- PostContent SELECT policy는 부모 Post policy와 완전히 같은 predicate를 직접 전개할 수도 있다. 다만 두 policy parity, DIRECT 후속 확장과 eligibility 조건이 독립적으로 drift하지 않는다는 검증이 있어야 한다.
- 동등한 Drizzle metadata 표현과 hand-written migration SQL을 사용할 수 있다. snapshot, catalog와 실제 policy 결과가 spec을 만족해야 한다.

### Known Traps

- `TO PUBLIC`, policy role 생략 또는 `kosmo_worker` policy 추가는 GraphQL-only 경계를 넓힌다.
- Profile helper의 `NULL`을 wildcard처럼 처리하면 account-only/malformed context가 private Post 권한을 얻는다.
- Post INSERT policy에서 `current_content_id IS NOT NULL`을 요구하면 skeleton-first create가 실패한다.
- UPDATE `WITH CHECK`를 생략하면 작성자가 row의 `profile_id`를 다른 actor로 바꿀 수 있다.
- Active-only SELECT는 Tombstone UPDATE `RETURNING`과 반복 삭제 parity를 깨뜨린다.
- Post policy가 같은 Post table을 source visibility 확인용으로 조회하면 infinite recursion 오류가 발생할 수 있다.
- Notification 회귀를 피하려고 Account membership 전체를 viewer로 인정하면 일반 Post Node/DIRECT 권한이 넓어진다.
- migration/CI 성공을 실제 `kosmo_api` workload cutover 또는 production 승인으로 해석하면 안 된다.

## Risks / Trade-offs

- [작성자 Tombstone SELECT는 strict Active-only viewer보다 넓다] → author equality로만 제한하고 다른 viewer와 PostContent direct lookup을 role-level로 검증한다.
- [호환 DML policy는 장기 GraphQL read-only 목표보다 넓다] → 실제 현재 SQL command만 허용하고 removal owner를 PROD-765로 고정한다.
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
