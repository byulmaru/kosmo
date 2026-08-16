## Why

Post/PostContent GraphQL 권한과 visibility는 이미 application policy가 중앙에서 소유하고 있다. `main`에 병합된 GraphQL 전용 RLS와 actor GUC는 같은 정책을 DB session에 중복시키므로, 새 forward migration으로 Post/PostContent RLS를 철회하고 application policy가 단일 enforcement임을 `post` capability에 반영한다.

## What Changes

- **BREAKING** 새 compensating forward migration으로 `post`와 `post_content`의 GraphQL RLS enablement와 네 policy를 제거한다. 기존 migration 파일이나 적용 이력은 수정·삭제하지 않는다.
- `post` capability의 GraphQL authorization/visibility enforcement를 중앙 application policy로 확정하고 PostgreSQL RLS와 actor GUC에 의존하지 않도록 변경한다.
- 기존 Post viewer/list/pagination/PostContent 관찰 동작을 별도 재정의하지 않고 그대로 보존한다.
- Post 삭제는 physical DELETE가 아니라 owner가 수행하는 Tombstone UPDATE와 기존 GraphQL payload를 유지한다. visibility와 무관한 owner의 Active 삭제, DELETED 반복의 멱등 성공, ordinary/Quote/reply와 pure Repost의 구분, Notification cleanup의 실패 격리를 보존한다.
- 완료된 obsolete `apply-graphql-post-viewer-rls-policies` change는 `openspec archive apply-graphql-post-viewer-rls-policies --skip-specs`로 history를 보존하며 archive한다. 새 change의 `post` delta는 정상 archive한다.
- generic migration replay/catalog 검증과 기존 GraphQL/core regression으로 철회를 검증한다. 파일별 migration behavior test는 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/policies/post-list.md`
- Linear Contract: [PROD-777](https://linear.app/byulmaru/issue/PROD-777/postpostcontent-graphql-rls를-제거하고-application-visibility-policy를-유지한다)
- Linear Implementations: PROD-777

## Capabilities

### New Capabilities

- 없음.

### Modified Capabilities

- `post`: GraphQL Post authorization/visibility의 enforcement를 PostgreSQL RLS/actor GUC가 아닌 중앙 application policy로 고정하고, 기존 viewer/list/pagination/PostContent 관찰 동작과 Tombstone deletion payload를 보존한다.

## Impact

- Post/PostContent Drizzle RLS metadata와 새 compensating migration/snapshot, 관련 PostgreSQL catalog 상태에 영향을 준다.
- `openspec/specs/post/spec.md`의 `post` capability delta가 GraphQL application authorization/visibility 경계를 추가한다. 기존 viewer/list/pagination/PostContent 동작은 중복해 재정의하지 않는다.
- Post deletion의 Tombstone UPDATE, owner permission/Not Found/idempotency와 GraphQL `postId`/`repostSource`, pure Repost Notification cleanup 계약을 검증 범위에 둔다.
- 다른 table RLS, Worker/Fedify/Temporal/Post policy 재설계, GraphQL operation session/`ctx.db`/actor GUC 제거, runtime role 통합과 credential cutover는 이 change에 포함하지 않는다.
- production preflight, sync/apply, cutover와 live 검증은 별도 승인 범위로 남긴다.
