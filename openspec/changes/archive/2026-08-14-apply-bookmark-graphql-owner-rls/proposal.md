## Why

GraphQL Bookmark Node, `Profile.bookmarks`, `Post.viewerBookmark`와 create/delete 경로는 selected Profile 소유권을 애플리케이션 predicate로만 제한한다. PROD-771은 기존 GraphQL 계약을 유지하면서 non-owner `kosmo_api`가 Bookmark row를 다른 Profile 경계에서 읽거나 변경하지 못하도록 PostgreSQL RLS를 additive하게 강제한다.

## What Changes

- `bookmark.profile_id = public.kosmo_current_profile_id()`를 기준으로 `kosmo_api`의 Bookmark owner SELECT와 INSERT/DELETE 경계를 정의한다.
- Bookmark Node, owner connection, viewer loader와 create/delete Mutation의 기존 payload·멱등성·cache 계약을 유지한다.
- Target Post가 숨겨져도 Owner의 Bookmark row 조회와 삭제는 유지하고, `Bookmark.post` 노출과 목록 edge 포함은 기존 Post 조회 경계에 맡긴다.
- missing, empty 또는 malformed Profile actor context와 다른 selected Profile은 Bookmark row에 접근하지 못하게 한다.
- table owner와 `kosmo_worker` `BYPASSRLS`, 기존 application predicate, GraphQL session lifecycle과 공통 object ACL을 유지한다.
- 별도 파일별 migration behavior test를 만들지 않고 기존 GraphQL integration, generic migration replay와 정확한 비운영 revision의 role-level matrix로 검증한다.
- Post/PostContent를 포함한 다른 table RLS, production preflight/sync/apply/cutover/live 검증은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/bookmark.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- Linear Contract: PROD-771
- Linear Implementations: PROD-771
- Upstream: PROD-707 Bookmark consumer inventory, PROD-370 actor helper, PROD-724 runtime object ACL, PROD-726 GraphQL operation session
- Related: PROD-713 Post/PostContent viewer RLS
- Downstream: PROD-767 GraphQL RLS coverage gate, PROD-716 credential cutover

## Capabilities

### New Capabilities

- `bookmark-graphql-row-level-security`: GraphQL `kosmo_api`의 Bookmark owner row 조회·생성·삭제 RLS와 hidden Target Post 분리 계약을 정의한다.

### Modified Capabilities

없음.

## Impact

- `packages/core/db/tables.ts`의 Bookmark RLS metadata
- 새 Drizzle migration과 snapshot의 Bookmark RLS enablement 및 `kosmo_api` owner policy DDL
- Bookmark GraphQL integration의 selected Profile, hidden Target Post와 owner delete 검증
- 정확한 비운영 revision의 `kosmo_api`/`kosmo_worker` role-level 검증
- GraphQL schema·payload, 다른 table policy, role/credential provisioning과 production 상태에는 변화가 없다.
