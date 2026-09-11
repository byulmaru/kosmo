# Database Design: Schema

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
- Standard UUIDv7 provides time grouping without coupling DB identity to a table registry.
- Generate new primary keys with the PostgreSQL 18.4 built-in `uuidv7()` function as the column default. Do not duplicate UUID bit layout code in the application.
- PostgreSQL UUIDv7 IDs are time-grouped but are not treated as monotonic within the same millisecond.
- Keep DB UUID and GraphQL Relay global ID as separate responsibilities. GraphQL ID contains the concrete typename and DB UUID as an opaque value.
- Do not reserve or decode table discriminator bits for GraphQL type routing.
- Existing kosmo UUIDv8 primary keys and foreign keys remain valid permanently. Do not delete, backfill, or rewrite them to UUIDv7.
- Existing UUIDv8 and new UUIDv7 share the same 48-bit millisecond timestamp position and can coexist in PostgreSQL `uuid` columns, relations, loaders, and time-grouped ordering.
- Changing the column default requires a schema migration, but it must not rewrite existing primary or foreign key values.
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

## Base Table Responsibilities

- `account`: maps an OIDC account to a kosmo internal account. Authentication secrets remain owned by the OIDC server.
- `application`: tracks which app/client issued a session.
- `application_secret`: supports secret rotation/revocation as 1:N. Do not store plaintext secrets.
- `session`: account, application, token hash, state, expiry, and active profile.
- `profile`: social identity that writes posts, follows, and federates.
- `account_profile`: account-profile N:N relationship and role.
- `post`: post metadata, visibility, state, and current content pointer.
- `post_content`: immutable authored-content revision, storing one canonical versioned `{ version, summary, body }` JSON document and eventually `(post_id, revision_number)` uniqueness when revision numbering lands. V1 `summary` is nullable Plain Text Content Warning and `body` is the canonical ProseMirror document. V1 Media block nodes own `mediaId` and order, the document root owns `sensitiveMedia`, and the referenced `media` row owns nullable `alt_text`; these JSON references are the intentional ADR 0022 exception to the normal FK-backed relationship rule. GraphQL may keep `contentWarning` and `bodyText` as compatibility projections. Plain Text and executable HTML are never second canonical stored bodies. ActivityPub adapters map Note `summary` to document `summary`.
- `profile_follow`: established follower/followee direction only; row existence means the follow relationship is active.
- `profile_follow_request`: pending follower/followee request direction before a follow relationship is established. The row itself means the request is pending; accepted or rejected requests are removed instead of stored with a state.
