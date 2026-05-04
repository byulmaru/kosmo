# Database Design Memory

Use this memory when designing or reviewing the kosmo PostgreSQL/Drizzle database schema, especially for ID strategy, UUID v7 type codes, GraphQL Relay ID representation, naming conventions, media/file table boundaries, post content versioning, soft deletes, ActivityPub/AT Protocol data boundaries, and MVP versus follow-up migrations.

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

- The initial schema should focus on the minimum SNS backbone: `account`, `application`, `session`, `profile`, `account_profile`, `post`, `post_content`, and `profile_follow`.
- Defer fluid UX/policy areas to later migrations: profile tags, themes, ActivityPub detail tables, AT Protocol caches, moderation, notifications, block/mute, and media processing.
- Reflect expensive-to-change boundaries early: account-profile N:N, post content versioning, and profile-follow directionality.
- Keep DB internal IDs, external API IDs, Object Storage keys, and CDN URLs as separate responsibilities.

## Naming

- Document table, column, enum, foreign key, and index naming rules.
- Prefer names that reveal the target, such as `profile_follow`, over broad names such as `follow`.
- Make relationship direction explicit in column names, for example `follower_profile_id` and `followee_profile_id`.

## ID Strategy

Prefer UUID v7 stored as PostgreSQL `uuid` for database primary keys. Reconsider table-prefix text IDs such as `PRFL0...`.

Recommended direction:

- Do not store string prefixes in DB primary keys.
- Prefer PostgreSQL native `uuid` over text IDs for joins, index size, cache locality, and throughput.
- UUID v7 provides time-ordering and distributed generation, making it a strong default for a social product.
- If the PostgreSQL version does not generate UUID v7 directly, generate UUID v7 in the web server/application before insert.
- PostgreSQL versions with native UUID v7 generation can also be considered for DB-side generation.
- Keep GraphQL Relay global IDs opaque.
- For GraphQL Relay Node type discrimination, reserve part of the UUID v7 random/implementation-defined area for a table type code.
- Node resolvers can decode the UUID type code to choose the target table.
- Map type codes to human-readable type names for API responses or logs when needed.

UUID v7 type-code policy:

- Never modify UUID version bits, variant bits, or timestamp bits.
- Store the type code in a fixed part of the UUID v7 random/implementation-defined area.
- Choose enough type-code width early, for example 8 bits for 256 types or 12 bits for 4096 types.
- Document that the type code reduces random collision space, and calculate whether the remaining random bits are sufficient.
- Generate IDs only through a shared `generateId(tableType)` utility.
- Decode IDs only through a shared `decodeIdType(id)` utility.
- Store IDs as PostgreSQL `uuid`, not as string prefixes.

Initial type-code examples:

| Code | Table                | Description                          |
| ---: | -------------------- | ------------------------------------ |
|  `0` | `account`            | Login unit mapped to an OIDC account |
|  `1` | `application`        | App/client connecting to kosmo       |
|  `2` | `application_secret` | Application secret                   |
|  `3` | `session`            | Account and application session      |
|  `4` | `profile`            | Social profile                       |
|  `5` | `account_profile`    | Account-profile relationship         |
|  `6` | `post`               | Post metadata                        |
|  `7` | `post_content`       | Post body revision                   |
|  `8` | `profile_follow`     | Profile follow relationship          |
|  `9` | `file_object`        | Object Storage file                  |
| `10` | `media_asset`        | Uploaded logical media               |
| `11` | `media_variant`      | Thumbnail/preview derived file       |
| `12` | `post_media`         | Post-media relationship              |

Relay global ID options:

- The opaque payload can contain only the UUID, with the Node resolver reading the UUID type code.
- The opaque payload can contain `typeCode:id`, with validation that the payload type code matches the UUID type code.
- Clients should not depend on UUID structure or type codes.

Benchmark candidates:

- `TEXT prefix + ULID`
- `CHAR(26) ULID`
- `UUID v7`
- `UUID v7` with reserved type-code bits

Queries to check:

- `post.profile_id -> profile.id` joins
- `post_media.media_asset_id -> media_asset.id` joins
- `(profile_id, created_at DESC)` timeline pagination
- GraphQL Node ID decode followed by single-row lookup
- Index size, query plan, insert locality, cache hit ratio, and maximum throughput

## Relationship Modeling

- Use explicit join tables when an N:N relationship has role, state, order, timestamp, or permissions.
- Put relationship-context values on the join table.
- For example, post-specific `alt_text`, `position`, `sensitivity`, thumbnail `focus_x`, and `focus_y` belong on `post_media`.
- Avoid polymorphic foreign keys in the initial schema. Prefer explicit relationship tables.
- Add ActivityPub actor details, inbox/outbox queues, and AT Protocol record/cache tables after the implementation path is concrete.

## Base Table Responsibilities

- `account`: maps an OIDC account to a kosmo internal account. Authentication secrets remain owned by the OIDC server.
- `application`: tracks which app/client issued a session.
- `application_secret`: supports secret rotation/revocation as 1:N. Do not store plaintext secrets.
- `session`: account, application, token hash, state, expiry, and active profile.
- `profile`: social identity that writes posts, follows, and federates.
- `account_profile`: account-profile N:N relationship and role.
- `post`: post metadata, visibility, state, and current content pointer.
- `post_content`: body revision, with `(post_id, revision_number)` unique.
- `profile_follow`: follower/followee direction and pending/accepted/rejected state.

## Media And Files

Separate media responsibilities:

- `file_object`: actual Object Storage file, with `storage_key`, `mime_type`, `byte_size`, `sha256`, `width`, `height`, and `deleted_at`.
- `media_asset`: logical media uploaded by a user, referencing the original `file_object`.
- `media_variant`: thumbnail, preview, compressed, resized, WebP/AVIF, or blur preview variants.
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
- Mark `media_asset` and `file_object` with `deleted_at`, then physically delete after a grace period.
- Manage `session` and `application_secret` with revoke/expire timestamps.
- `post_media` can cascade if audit/restore is not required, but review that with post/media deletion policy.
- Treat `ON DELETE CASCADE` as policy, not convenience. Check whether rows are needed for audit, moderation, federation, or cost accounting.

## Review Checklist

- Are business identifiers avoided as primary keys?
- Are internal DB IDs separated from GraphQL/REST external IDs?
- Is there a real reason to store prefixed IDs in the database?
- Is the UUID v7 type-code bit reservation approach considered for GraphQL type discrimination?
- Are UUID version, variant, and timestamp bit preservation rules documented?
- Is there a table type-code map and a policy for adding or retiring codes?
- Is UUID v7 with PostgreSQL `uuid` considered before text IDs?
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
