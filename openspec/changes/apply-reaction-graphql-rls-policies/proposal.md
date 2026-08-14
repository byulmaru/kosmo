## Why

GraphQL Reaction 조회와 Mutation은 대상 Post 조회 가능성 및 selected Profile 소유권을 여러 애플리케이션 predicate에 의존한다. PROD-769는 `kosmo_api` non-owner principal에서도 Reaction 행 권한을 PostgreSQL RLS로 강제하되, hidden/deleted Post의 owner cleanup과 기존 GraphQL payload·Notification cleanup·viewer-independent count를 보존한다.

## What Changes

- `reaction` table에 RLS를 활성화하고 FORCE RLS는 비활성 상태로 유지한다.
- `kosmo_api`의 Reaction SELECT, INSERT, DELETE 권한을 command별 policy로 분리한다.
- Target Post policy branch는 기존 GraphQL의 순수 Repost source eligibility도 중첩된 `public.post` 조회로 확인해 source가 숨겨진 Repost에 대한 직접 Reaction SQL 우회를 막는다. Post RLS 자체는 변경하지 않는다.
- 조회 가능한 Target Post의 모든 Reaction은 viewer와 무관하게 SELECT 가능하게 해 count를 보존하고, selected Profile owner row는 hidden/deleted Target Post에서도 delete와 `RETURNING`을 완료할 수 있게 한다.
- INSERT와 DELETE는 현재 selected Profile만 자기 Reaction을 생성·정리하도록 제한한다.
- 기존 Notification 생성의 owner Reaction `SELECT FOR UPDATE`는 임시 owner lock policy로 유지하되 실제 Reaction UPDATE는 계속 거부한다. Reaction row lock 제거는 후속 범위로 미룬다.
- GraphQL Node/relation/viewer/count와 add/delete payload·Notification cleanup의 관찰 가능한 계약을 기존 GraphQL/core integration에서 검증한다.
- 비운영 PostgreSQL에서 `kosmo_api` role matrix와 owner 및 `kosmo_worker` BYPASSRLS 무회귀를 검증한다.
- Post/PostContent policy, 다른 table RLS, Worker/Fedify/Temporal 실행 경계와 production principal cutover는 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`, `docs/domain/decisions/0016-reaction-selector-current-state.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/design/reactions.md`, `memory/database-migrations.md`
- Linear Contract: PROD-769
- Linear Implementations: PROD-769

## Capabilities

### New Capabilities

- `reaction-graphql-row-level-security`: GraphQL `kosmo_api`의 Reaction 조회·추가·삭제 행 권한과 owner cleanup, aggregate 및 trusted workload 무회귀 계약을 정의한다.

### Modified Capabilities

없음.

## Impact

- `packages/core/db/tables.ts`의 Reaction RLS metadata
- 새 additive Drizzle migration과 snapshot의 Reaction RLS policy DDL 및 순수 Repost source guard
- Reaction GraphQL/core integration test의 owner/non-owner, hidden/deleted Post, Node/relation/viewer/count와 delete cleanup matrix
- 정확한 비운영 revision의 `kosmo_api` 및 `kosmo_worker` role-level 검증
- 기존 Notification row lock 호환을 위한 임시 owner UPDATE policy와 실제 UPDATE 거부 검증
- GraphQL schema, Reaction 제품 의미, Notification lifecycle, Post/PostContent RLS, Worker/Fedify/Temporal policy, credential selector와 production sync/apply/cutover에는 변화가 없다. 기존 Reaction row lock을 advisory lock으로 바꾸거나 제거하지 않는다.
