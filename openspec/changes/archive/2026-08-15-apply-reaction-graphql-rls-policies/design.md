## Context

현재 Reaction GraphQL 경로는 `Reaction` Node loader, `Post.viewerReactions`, `Post.reactionProfiles`, `Post.reactionCounts`, `addReaction`과 `deleteReaction`으로 나뉜다. Node와 count는 `postAccessWhere`를 사용하고, Profile 목록은 별도 Profile visibility를 적용하며, viewer loader와 delete core service는 selected Profile ownership을 직접 조건으로 사용한다.

`post`는 이미 `kosmo_api` restrictive viewer SELECT와 permissive transition policy를 가진 RLS table이다. 따라서 Reaction policy의 Target Post subquery는 현재 principal에서 보이는 `post` 행을 재사용할 수 있다. 반면 PostgreSQL RLS에서 `DELETE ... RETURNING`은 DELETE policy뿐 아니라 SELECT 가시성도 필요하므로 Target Post visibility만 적용한 SELECT policy는 hidden/deleted Post owner cleanup 결과를 잃는다.

## Goals / Non-Goals

**Goals:**

- `reaction`의 GraphQL SELECT, INSERT, DELETE 행 권한을 `kosmo_api` RLS로 강제한다.
- 조회 가능한 Target Post의 모든 Reaction을 SELECT해 viewer-independent count를 유지한다.
- selected Profile owner가 hidden/deleted Target Post의 자기 Reaction을 `DELETE ... RETURNING`으로 정리하게 한다.
- 기존 GraphQL Node/relation, payload와 Notification cleanup을 유지한다.
- 기존 Notification 생성의 Reaction row lock을 이번 RLS 전환에서 보존하되 실제 Reaction UPDATE는 계속 금지한다.
- disposable PostgreSQL에서 실제 `kosmo_api` operation principal과 `kosmo_worker` BYPASSRLS를 검증한다.

**Non-Goals:**

- Post/PostContent 또는 다른 table RLS 변경
- GraphQL application predicate 제거
- Reaction 제품 의미, Notification lifecycle, Worker/Fedify/Temporal execution 변경
- 기존 Reaction `SELECT FOR UPDATE` 제거 또는 advisory lock으로의 교체
- 역할, ACL, credential, PgBouncer 또는 operation session lifecycle 변경
- production preflight, sync/apply, principal cutover와 live 검증
- 파일별 migration behavior test 추가

## Implementation Guidance

### Current Constraints

- `addReaction`은 같은 transaction에서 Target Post를 먼저 조회하고, `INSERT ... RETURNING` 뒤 conflict 시 owner Reaction을 다시 SELECT한다. INSERT 결과를 반환하려면 생성된 행의 SELECT 가시성도 필요하다.
- `deleteReaction`은 Target Post를 다시 조회하지 않고 actor Profile/Post/Type으로 `DELETE ... RETURNING`을 수행한다. hidden/deleted cleanup을 유지하려면 actor owner row의 SELECT 가시성이 필요하다.
- Reaction Node는 Target Post와 join하고 application `postAccessWhere`를 유지한다. 순수 Repost source eligibility는 Post RLS가 아직 소유하지 않으므로 application predicate는 유지하되, Reaction의 Target Post SELECT/INSERT policy도 중첩된 `public.post` source 조회로 같은 eligibility를 database 경계에서 재확인해야 한다.
- `reactionCounts`는 Reaction Profile visibility와 무관하게 모든 행을 집계해야 한다. SELECT policy를 actor owner로만 제한하면 count 계약이 깨진다.
- `reactionProfiles`는 Reaction RLS와 별도로 기존 Profile visibility를 계속 적용해야 한다.
- 기존 `(post_id, type, created_at, id)`와 `profile_id` index가 policy 및 consumer 조건을 지원하며, 비운영 plan 병목 증거 없이 index를 추가하지 않는다.
- Notification 생성은 현재 Reaction source를 `SELECT FOR UPDATE`한다. PostgreSQL은 이 조회에도 UPDATE policy를 적용하므로, RLS 활성화 뒤 기존 cleanup lifecycle을 보존하려면 owner row-lock 전용 policy가 필요하다.

### Recommended Approach

`Reactions`를 `pgTable.withRLS`로 전환하고 `kosmo_api`에 다음 최소 policy를 둔다.

- Target Post가 현재 `kosmo_api`에 보이고, 순수 Repost이면 직접 source도 현재 `kosmo_api`에 보이는 경우에 모든 Reaction을 허용하는 permissive SELECT policy
- current Profile actor가 `reaction.profile_id`와 같을 때 owner row를 허용하는 permissive SELECT policy
- current Profile actor가 자기 `profile_id`로 현재 보이는 Active Target Post에 추가할 때만 허용하는 INSERT policy. 순수 Repost이면 직접 source의 현재 visibility/profile/instance eligibility도 중첩된 `public.post` 조회로 확인한다.
- current Profile actor가 자기 Reaction을 제거할 때만 허용하는 DELETE policy
- current Profile actor의 기존 `SELECT FOR UPDATE`만 허용하고 `WITH CHECK (false)`로 실제 행 변경은 거부하는 임시 UPDATE policy

두 SELECT policy는 PostgreSQL의 permissive OR로 결합한다. Target Post branch가 count와 일반 relation을 제공하고 owner branch가 add conflict/readback 및 hidden/deleted `DELETE ... RETURNING`을 제공한다. owner branch의 내부 SQL 가시성이 GraphQL 노출로 이어지지 않도록 Reaction Node는 기존 Target Post join과 `postAccessWhere`를 유지하고, Post field들은 이미 조회된 Post에서만 실행한다. Target Post branch의 source guard는 owner SELECT/DELETE cleanup branch에는 적용하지 않는다.

임시 UPDATE policy는 기존 Notification source query의 Reaction row lock만 보존한다. `USING`은 current Profile owner 행으로 제한하고 `WITH CHECK (false)`를 사용해 실제 Reaction UPDATE를 허용하지 않는다. 이 change는 새로운 advisory lock을 도입하지 않으며, 기존 social interaction row lock을 제거하는 후속 변경도 함께 수행하지 않는다.

기존 Reaction GraphQL integration suite의 operation client를 disposable database owner login에서 startup `role=kosmo_api`로 전환해 같은 GraphQL 관찰 경로를 실제 non-owner RLS principal에서 실행한다. 기존 hidden Post cleanup에 DELETED Post cleanup과 current principal assertion을 보강한다. owner fixture setup/inspection은 process-wide owner connection을 유지하고, 별도 worker operation connection으로 representative hidden/deleted row SELECT가 BYPASSRLS임을 확인한다. generic migration replay와 snapshot chain은 기존 공식 script로 검증한다.

### Allowed Alternatives

- Target Post와 owner 조건을 하나의 permissive SELECT policy에서 OR로 표현할 수 있다. 다만 catalog 검증과 리뷰에서 두 책임을 분리해 확인할 수 있는 현재 권장안보다 policy 의도가 덜 선명하다.
- privileged delete function으로 owner cleanup만 RLS를 우회할 수 있으나 function ownership, EXECUTE ACL, search path와 호출 계약이라는 새 보안 경계를 만든다. 현재 direct `DELETE ... RETURNING` 계약과 최소 scope를 유지하는 권장안보다 우선하지 않는다.

### Known Traps

- SELECT를 Target Post visibility 하나로 제한하면 hidden/deleted owner DELETE와 RETURNING이 사라진다.
- SELECT를 selected Profile owner로만 제한하면 viewer-independent count와 Profile 목록이 축소된다.
- DELETE policy만 owner로 추가해도 PostgreSQL SELECT 가시성 요구 때문에 RETURNING 문제를 해결하지 못한다.
- INSERT를 broad `WITH CHECK (true)`로 열거나 Account membership 전체를 actor로 인정하면 다른 Profile 소유권이 열린다.
- owner SELECT branch를 이유로 Reaction Node의 Post join/predicate를 제거하면 hidden/deleted Reaction이 GraphQL Node로 노출될 수 있다.
- Target Post branch가 outer Repost만 확인하면 source가 숨겨진 순수 Repost에 대한 direct `kosmo_api` INSERT/SELECT가 application predicate를 우회할 수 있다. source guard는 기존 Post RLS를 통과하는 nested `public.post` query로 구현하고 Post policy 자체는 수정하지 않는다.
- UPDATE policy를 생략하면 기존 Notification source `SELECT FOR UPDATE`가 RLS에서 행을 잃어 Notification 생성·cleanup regression이 발생한다. 반대로 `WITH CHECK`를 owner 조건으로 열면 제품에 없는 Reaction UPDATE 권한이 생긴다.
- 기존 row lock을 advisory lock으로 치환하면 Notification 동시성 의미와 locking policy를 함께 재설계하는 별도 범위가 된다.
- 파일별 migration behavior test를 다시 추가하거나 production DB/role을 검증 대상으로 사용하지 않는다.

## Risks / Trade-offs

- [owner SELECT branch는 `kosmo_api` SQL 수준에서 hidden/deleted Target Post의 자기 Reaction row를 보이게 한다] → GraphQL Node와 relation은 Target Post boundary를 유지하고, role-level 검증에서 direct SQL 가시성과 GraphQL 비노출을 각각 확인한다.
- [순수 Repost source가 현재 operation actor에게 숨겨지면 Reaction Notification source loader도 RLS에서 Reaction을 얻지 못한다] → 기존 nullable source 계약에 따라 해당 Notification Node를 숨기되 owner Reaction cleanup과 Notification row 정리는 계속 별도로 수행한다. Recipient별 RLS execution은 PROD-766 범위로 유지한다.
- [Post RLS가 바뀌면 Reaction Target Post branch 결과도 함께 바뀐다] → Reaction이 canonical Target Post 조회 정책을 따르는 의도적 결합으로 기록하고 Post policy 자체는 이 change에서 수정하지 않는다.
- [GraphQL integration 전체를 실제 `kosmo_api`로 실행하면 미분류 다른 table RLS/ACL 실패가 드러날 수 있다] → 우회하지 않고 PROD-769 경로의 실제 blocker인지 분류하며, 다른 table policy 변경으로 범위를 넓히지 않는다.
- [기존 Notification source query의 명시적 row lock은 social interaction locking policy와 장기적으로 맞지 않는다] → PROD-769에서는 RLS 전환 전 동작만 임시 owner policy로 보존하고, 실제 UPDATE를 `WITH CHECK (false)`로 차단한다. lock 제거·동시성 재설계는 후속 범위로 분리한다.

## Migration Plan

1. schema metadata와 additive migration/snapshot에 Reaction RLS와 다섯 policy를 추가한다. 다섯 번째 policy는 기존 owner row lock 호환 전용이며 실제 UPDATE를 거부한다.
2. blank disposable database에서 공식 migration replay와 Drizzle schema check를 실행한다.
3. Reaction GraphQL integration을 실제 disposable `kosmo_api` operation principal에서 실행하고 core service regression을 실행한다.
4. catalog, missing/empty/malformed actor, visible/hidden/deleted Target Post, owner/non-owner, count, owner row lock/실제 UPDATE 거부와 owner/Worker bypass matrix를 비운영에서 확인한다.
5. 문제가 있으면 credential cutover 전에 새 forward migration으로 Reaction policy와 RLS를 함께 되돌린다. 기존 migration history는 수정하지 않는다.
6. production preflight, sync/apply, principal cutover와 live 검증은 별도 승인 전 수행하지 않는다.

## Open Questions

없음.
