# Database Design: Media And Lifecycle

## Media And External Storage

Current media direction:

- `media` is the only Kosmo persistence for a logical image. Kosmo stores the Media Storage Service completion result's
  public URL and media type on the Local Media row, but does not mirror bytes, storage keys, derived
  representations or dimensions in a separate `file` table.
- A Local Media row is created when an authenticated Account/Profile starts an upload. It keeps its Kosmo identity,
  upload Account, actor Profile, `UPLOADING` state, opaque external storage reference and upload expiry.
- After Kosmo confirms storage through Media Storage Service, the same row stores its URL and media type and transitions
  atomically to `READY`; later read projections use these columns without calling the storage service. Only `READY`
  Media can be attached to a Post or used as a Profile representation.
- The external storage reference is unique persistence data but is never the GraphQL/Media identity and is not exposed
  to clients. API consumers use the Media global ID.
- The unused legacy `/upload` route, direct R2 configuration and `file` persistence are removed rather than supported as
  a compatibility path. No database-emptiness precondition is required for that replacement.
- Remote Media remains a canonical product concept, but its Media Storage Service projection and persistence shape are
  deferred until a real Remote Media implementation requires them. Do not add future File or remote-storage columns to
  the Local upload slice.
- Do not add `post_media` or `post_content_media` as a duplicate source for Post Content Media. Validate referenced
  Media existence, Ready state and Account authorization when creating each revision, and do not physically delete
  referenced Media until a separate lifecycle contract preserves historical revisions.
- `profile_media`: add later when avatar/banner usage needs its own context.

Do not expose a stored original URL without the owning Post/Profile viewer policy. Timelines can use thumbnail/compressed
variants, detail views can use high-resolution variants, and original access remains a product/cost policy decision.

Deduplication questions:

- Is the goal internal storage optimization?
- Is the goal a user-facing "reuse recent image" feature?
- Is the value worth slower uploads?
- Should files with different quality, size, or metadata count as the same image?

Media Storage Service responsibilities:

- Finalize original uploads.
- Generate thumbnails, compressed images, resolution-specific variants, WebP/AVIF optimized variants, and blurhash/placeholders.
- Cache by CDN cache key or variant key.

Thumbnail policy:

- Start with center crop.
- Consider `focus_x` and `focus_y` over time for creator images.
- Manual focus may be safer than automatic saliency because creator intent can differ from detected image center.
- If focus editing is introduced for Post Content, define it as an additive Media node attr unless image-byte editing
  or another independently owned relationship requires a new canonical boundary.

## Soft Deletes And Cleanup

- Prefer soft delete for user-visible domain objects.
- For `post`, consider `state` and `deleted_at` if federation tombstones, moderation, or user restore policy matter.
- Mark `media` with `deleted_at` once deletion policy is introduced, then request external object deletion after a grace period.
- Manage `session` and `application_secret` with revoke/expire timestamps.
- Post Content Media references have no join row to cascade. Review Media physical deletion against current and
  historical revision references before introducing it.
- Treat `ON DELETE CASCADE` as policy, not convenience. Check whether rows are needed for audit, moderation, federation, or cost accounting.
