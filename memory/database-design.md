# Database Design Memory

Use this memory when designing or reviewing the kosmo PostgreSQL/Drizzle database schema, especially for UUIDv7 ID strategy, GraphQL Relay ID separation, naming conventions, media/file table boundaries, post content versioning, soft deletes, ActivityPub/AT Protocol data boundaries, and MVP versus follow-up migrations.

The detailed guidance is split by topic so each document can be read independently. The section links below preserve the headings and anchors from the former single document.

## Topic files

- [Review posture, checklist, and response shape](database/review.md) — use when reviewing a schema proposal or writing the review response.
- [Schema direction, naming, IDs, and table responsibilities](database/schema.md) — use when designing tables, names, identifiers, or base table ownership.
- [Relationships, projections, and locking](database/relationships.md) — use when adding relationships, projections, or application concurrency rules.
- [Media, external storage, and cleanup](database/media.md) — use when deciding media storage, representation, or deletion lifecycle.

## Review Posture

Moved to [Database Design: Review](database/review.md#review-posture).

## Review Order

Moved to [Database Design: Review](database/review.md#review-order).

## General Conventions

Moved to [Database Design: Schema](database/schema.md#general-conventions).

## Kosmo Schema Direction

Moved to [Database Design: Schema](database/schema.md#kosmo-schema-direction).

## Naming

Moved to [Database Design: Schema](database/schema.md#naming).

## ID Strategy

Moved to [Database Design: Schema](database/schema.md#id-strategy).

## Relationship Modeling

Moved to [Database Design: Relationships](database/relationships.md#relationship-modeling).

### Notification Projection Exception

Moved to [Database Design: Relationships](database/relationships.md#notification-projection-exception).

## Runtime Locking Policy

Moved to [Database Design: Relationships](database/relationships.md#runtime-locking-policy).

## Base Table Responsibilities

Moved to [Database Design: Schema](database/schema.md#base-table-responsibilities).

## Media And External Storage

Moved to [Database Design: Media And Lifecycle](database/media.md#media-and-external-storage).

## Soft Deletes And Cleanup

Moved to [Database Design: Media And Lifecycle](database/media.md#soft-deletes-and-cleanup).

## Review Checklist

Moved to [Database Design: Review](database/review.md#review-checklist).

## Response Shape For Reviews

Moved to [Database Design: Review](database/review.md#response-shape-for-reviews).
