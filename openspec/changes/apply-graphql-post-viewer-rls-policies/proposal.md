## Why

GraphQL Post/PostContent 조회 권한은 애플리케이션 predicate만으로 강제되어 `kosmo_api` non-owner principal 전환 시 database row boundary가 없다. PROD-713은 현재 GraphQL Query/Mutation 호환성을 유지하면서 viewer와 author actor context를 PostgreSQL RLS로 additive하게 강제한다.

## What Changes

- `post`와 `post_content`에 RLS를 활성화하고 FORCE RLS는 비활성 상태로 유지한다.
- `kosmo_api` restrictive SELECT policy가 Active Post, Active/Normal author Profile·non-suspended Instance, PUBLIC/UNLISTED, author와 established FOLLOWERS viewer를 강제한다.
- DIRECT는 recipient materialization을 소유한 PROD-462 전까지 author-only interim으로 처리한다.
- `post_content` 조회는 부모 Post의 같은 viewer policy에 종속한다.
- DELETED Post/PostContent는 작성자에게도 숨기고 실제 삭제 lifecycle은 Temporal Workflow/Activity에 남긴다.
- `kosmo_api` 전환 중 create/reply/repost와 미확인 Active-row Mutation을 막지 않도록 Post/PostContent에 permissive `FOR ALL USING (true) WITH CHECK (true)` transition policy를 제공한다.
- missing/empty/malformed actor setting과 account-only 세션은 공개 조회 외 SELECT 권한을 얻지 못하지만 transition DML command는 actor setting과 무관하게 허용한다.
- owner와 `kosmo_worker` `BYPASSRLS` 경로, PROD-724 object ACL, 기존 application predicate와 GraphQL session lifecycle은 변경하지 않는다.
- ordinary delete의 ACTIVE→DELETED 전이는 restrictive SELECT 때문에 GraphQL principal에서 허용되지 않으며 PROD-677 Temporal Workflow가 소유한다. GraphQL 쓰기가 모두 Temporal로 전환된 뒤 호환 DML policy를 제거하는 contract는 PROD-765가 소유한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `memory/database-migrations.md`
- Linear Contract: PROD-713
- Linear Implementations: PROD-713
- Upstream: PROD-370 actor helper, PROD-724 runtime object ACL, PROD-726 GraphQL operation session
- Downstream: PROD-716 credential cutover, PROD-462 DIRECT recipient policy, PROD-677/722/725 Temporal write 전환, PROD-765 Temporal 전환 뒤 DML policy 제거, PROD-766 Notification recipient context

## Capabilities

### New Capabilities

- `post-graphql-row-level-security`: GraphQL `kosmo_api`의 Post/PostContent viewer 및 transition DML RLS contract를 정의한다.

### Modified Capabilities

없음.

## Impact

- `packages/core/db/tables.ts`의 Post/PostContent RLS metadata
- 새 Drizzle migration과 snapshot의 RLS enablement 및 policy DDL
- migration-defined actor helper를 먼저 준비한 뒤 Drizzle schema sync를 수행하는 test database 진입점
- merge 뒤 정확한 비운영 revision의 `kosmo_api`/`kosmo_worker` role-level viewer·DML 검증
- GraphQL schema, resolver predicate, credential selector, production sync/apply와 실제 principal cutover에는 변화가 없다.
