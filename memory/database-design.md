# Database Design Memory

Use this memory when designing or reviewing the kosmo PostgreSQL/Drizzle database schema, especially for UUIDv7 ID strategy, GraphQL Relay ID separation, naming conventions, media/file table boundaries, post content versioning, soft deletes, ActivityPub/AT Protocol data boundaries, and MVP versus follow-up migrations.

## Review Posture

- Do not prematurely couple product policy, external API representation, and storage implementation.
- Model only the functionality needed now, but establish boundaries that are expensive to migrate later.
- Separate options, tradeoffs, decisions needed now, and decisions that can be deferred.
- Prefer proposals that are implementable with PostgreSQL and Drizzle ORM.

## Review Order

1. Read the PRD, user scenarios, current schema, and architecture documents first.
2. Identify core domain entities, ownership relationships, lifecycle states, and high-frequency query paths.
3. Check whether each table represents a durable domain concept rather than a UI screen or temporary implementation detail.
4. Review IDs, naming, foreign keys, unique constraints, indexes, deletion policy, and external API representation.
5. Separate MVP schema from schema that can wait for later migrations.
6. Summarize the recommended direction, concrete changes, deferred decisions, and open questions.

## General Conventions

- Use `snake_case` for PostgreSQL tables and columns.
- Keep singular/plural table naming consistent across the project.
- Give every major table a separate surrogate `id` primary key.
- Do not use business identifiers such as email, OIDC subject, handle, or URL as primary keys. Protect them with unique constraints instead.
- Prefer enum/status columns over booleans when states are likely to expand.
- Add `created_at` and `updated_at` to mutable domain tables.
- Add `deleted_at` only when deletion is part of the lifecycle.
- Design foreign key indexes around real join, filtering, pagination, and cleanup paths.

## Kosmo Schema Direction

- The initial schema should focus on the minimum SNS backbone: `account`, `application`, `session`, `profile`, `account_profile`, `post`, `post_content`, `profile_follow`, and `profile_follow_request`.
- Defer fluid UX/policy areas to later migrations: profile tags, themes, ActivityPub detail tables, AT Protocol caches, moderation, notifications, block/mute, and media processing.
- Reflect expensive-to-change boundaries early: account-profile N:N, post content versioning, profile-follow directionality, and separation between established follows and follow requests.
- Keep DB internal IDs, external API IDs, Object Storage keys, and CDN URLs as separate responsibilities.

## Naming

- Document table, column, enum, foreign key, and index naming rules.
- Prefer names that reveal the target, such as `profile_follow`, over broad names such as `follow`.
- Make relationship direction explicit in column names, for example `follower_profile_id` and `followee_profile_id`.

## ID Strategy

Prefer standard UUIDv7 stored as PostgreSQL `uuid` for new database primary keys. Reconsider table-prefix text IDs such as `PRFL0...`.

Recommended direction:

- Do not store string prefixes in DB primary keys.
- Prefer PostgreSQL native `uuid` over text IDs for joins, index size, cache locality, and throughput.
- Standard UUIDv7 provides time grouping and distributed application-side generation without coupling DB identity to a table registry.
- The current `createId` layout stores a 48-bit millisecond timestamp followed by a random tail. IDs are time-grouped but are
  not monotonic within the same millisecond.
- Generate UUIDv7 in the web server/application before insert through the shared `createId()` utility.
- Keep DB UUID and GraphQL Relay global ID as separate responsibilities. GraphQL ID contains the concrete typename and DB UUID as an opaque value.
- Do not reserve or decode table discriminator bits for GraphQL type routing.
- Existing kosmo UUIDv8 primary keys and foreign keys remain valid permanently. Do not delete, backfill, or rewrite them to UUIDv7.
- Existing UUIDv8 and new UUIDv7 share the same 48-bit millisecond timestamp position and can coexist in PostgreSQL `uuid` columns, relations, loaders, and time-grouped ordering.
- Store IDs as PostgreSQL `uuid`, not as string prefixes.
- An ID-only keyset is valid when arbitrary ordering and page placement within the same millisecond are acceptable.
  When persisted timestamp ordering matters, use an immutable timestamp plus an ID tie-breaker. When insertion order
  must also be monotonic for identical timestamps, use a database ordering key or change the generator in a separately
  reviewed platform change.

Relay global ID policy:

- Encode the concrete GraphQL typename and underlying DB UUID in the opaque global ID.
- Route directly to the concrete Node loader selected by the decoded typename.
- Do not accept raw DB UUID as a legacy GraphQL Node ID input.
- Do not retry another loader when the typename and underlying row do not match.
- Clients must not depend on typename, UUID, or encoding structure.

Benchmark candidates:

- `TEXT prefix + ULID`
- `CHAR(26) ULID`
- standard `UUIDv7`

Queries to check:

- `post.profile_id -> profile.id` joins
- `post_media.media_asset_id -> media_asset.id` joins
- `(profile_id, created_at DESC)` timeline pagination
- GraphQL global ID decode followed by concrete loader lookup
- Index size, query plan, insert locality, cache hit ratio, and maximum throughput

## Relationship Modeling

- Use explicit join tables when an N:N relationship has role, state, order, timestamp, or permissions.
- Put relationship-context values on the join table.
- For example, post-specific `alt_text`, `position`, `sensitivity`, thumbnail `focus_x`, and `focus_y` belong on `post_media`.
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

## Base Table Responsibilities

- `account`: maps an OIDC account to a kosmo internal account. Authentication secrets remain owned by the OIDC server.
- `application`: tracks which app/client issued a session.
- `application_secret`: supports secret rotation/revocation as 1:N. Do not store plaintext secrets.
- `session`: account, application, token hash, state, expiry, and active profile.
- `profile`: social identity that writes posts, follows, and federates.
- `account_profile`: account-profile N:N relationship and role.
- `post`: post metadata, visibility, state, and current content pointer.
- `post_content`: authored-content revision, storing one canonical versioned `{ version, summary, body }` JSON document and eventually `(post_id, revision_number)` uniqueness when revisioning lands. V1 `summary` is nullable Plain Text Content Warning and `body` is the canonical ProseMirror document; GraphQL may keep `contentWarning` and `bodyText` as compatibility projections. Plain Text and executable HTML are never second canonical stored bodies. ActivityPub adapters map Note `summary` to document `summary`.
- `profile_follow`: established follower/followee direction only; row existence means the follow relationship is active.
- `profile_follow_request`: pending follower/followee request direction before a follow relationship is established. The row itself means the request is pending; accepted or rejected requests are removed instead of stored with a state.

## Media And Files

Current media direction:

- `file`: physical Object Storage/R2 file owned by the application, with `storage_key`, `mime_type`, optional `byte_size`, optional `sha256`, optional `width`, optional `height`, and later deletion metadata when cleanup policy is added. Do not store public/CDN URL when it is derivable from `storage_key` and environment configuration; derive it at API/service boundaries when needed. Upload API can fill byte size from the incoming `File.size`; SHA-256 and dimensions are deferred to processing/measurement.
- `media`: logical media used by the product. It can represent local uploads or remote ActivityPub media via `source = LOCAL | REMOTE`, and every media row belongs to a `profile`.
- Local upload `media` rows initially reference `original_file_id`, which points to the uploaded R2 object. Image transformation and thumbnail generation are separated into a later worker/pipeline; that later work can fill `thumbnail_file_id`, thumbhash, dimensions, and hash metadata.
- Remote ActivityPub `media` rows may initially have no file references. Store remote URL and remote fetched timestamp on `media`; the remote actor/profile identity belongs to `profile`, then lazily materialize cached R2 `file` rows through an image proxy/processing pipeline later.
- Keep thumbhash on `media`; it is nullable because both local uploads and remote media can exist before worker/proxy processing.
- `post_media`: usage context for a post, with `position`, `alt_text`, `sensitivity`, `focus_x`, and `focus_y`.
- `profile_media`: add later when avatar/banner usage needs its own context.

Do not expose the original URL just because the original file is stored. Timelines can use thumbnail/compressed variants, detail views can use high-resolution variants, and original access should be a product/cost policy decision.

Deduplication questions:

- Is the goal internal storage optimization?
- Is the goal a user-facing "reuse recent image" feature?
- Is the value worth slower uploads?
- Should files with different quality, size, or metadata count as the same image?

Image processing worker responsibilities:

- Finalize original uploads.
- Generate thumbnails, compressed images, resolution-specific variants, WebP/AVIF optimized variants, and blurhash/placeholders.
- Cache by CDN cache key or variant key.

Thumbnail policy:

- Start with center crop.
- Consider `focus_x` and `focus_y` over time for creator images.
- Manual focus may be safer than automatic saliency because creator intent can differ from detected image center.
- If focus differs by post context, store it on `post_media`.

## Soft Deletes And Cleanup

- Prefer soft delete for user-visible domain objects.
- For `post`, consider `state` and `deleted_at` if federation tombstones, moderation, or user restore policy matter.
- Mark `media` and `file` with `deleted_at` once deletion policy is introduced, then physically delete R2 objects after a grace period.
- Manage `session` and `application_secret` with revoke/expire timestamps.
- `post_media` can cascade if audit/restore is not required, but review that with post/media deletion policy.
- Treat `ON DELETE CASCADE` as policy, not convenience. Check whether rows are needed for audit, moderation, federation, or cost accounting.

## Review Checklist

- Are business identifiers avoided as primary keys?
- Are internal DB IDs separated from GraphQL/REST external IDs?
- Is there a real reason to store prefixed IDs in the database?
- Are new DB IDs standard UUIDv7 without table discriminator coupling?
- Are UUID version, variant, and timestamp bit preservation rules documented?
- Are existing UUIDv8 IDs preserved without data migration?
- Are GraphQL global IDs and DB UUIDs kept as separate responsibilities?
- Is PostgreSQL `uuid` considered before text IDs?
- Can enum/status columns handle near-future state expansion?
- Are N:N relationships with role/state/order/timestamp represented as join tables?
- Is deletion policy clear per table?
- Are original files, media assets, variants, and usage contexts separated?
- Are CDN URL and Object Storage key responsibilities kept separate?
- Are ActivityPub/AT Protocol detail tables deferred until implementation needs are concrete?
- Is the MVP schema small while preserving expensive-to-change boundaries?

## Response Shape For Reviews

Use this format by default for schema design or review responses:

```md
**추천 방향**
짧은 결론.

**스키마 변경안**

- 테이블/컬럼/constraint/index 단위 변경.

**지금 결정할 것**

- 나중에 바꾸기 비싼 결정.

**후속으로 미룰 것**

- 정책이나 UX가 더 정해진 뒤 추가해도 되는 것.

**열린 질문**

- 제품/인프라 결정이 필요한 질문.
```
