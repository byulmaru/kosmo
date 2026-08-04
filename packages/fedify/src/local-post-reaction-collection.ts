import '@kosmo/core/polyfill';

import { EmojiReact, Like } from '@fedify/vocab';
import {
  ActivityPubActors,
  ActivityPubReactions,
  db,
  first,
  Instances,
  Profiles,
  Reactions,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { reactionTypes, reactionTypeSchema } from '@kosmo/core/validation';
import { and, count, desc, eq, inArray, isNotNull, lt, ne, or, sql } from 'drizzle-orm';
import { isCanonicalPostId } from './activitypub-post-uri';
import { loadLocalPostNote } from './local-post-note';
import type { PageItems, RequestContext } from '@fedify/fedify';
import type { SQLWrapper } from 'drizzle-orm';

const PAGE_SIZE = 50;
const FIRST_CURSOR = 'v1:first';

type Cursor =
  | { readonly kind: 'first' }
  | { readonly kind: 'after'; readonly createdAt: Temporal.Instant; readonly id: string };

type ReactionRow = {
  readonly activityUri: string | null;
  readonly actorUri: string | null;
  readonly createdAt: Temporal.Instant;
  readonly id: string;
  readonly instanceCanonicalOrigin: string | null;
  readonly instanceKind: (typeof InstanceKind)[keyof typeof InstanceKind];
  readonly profileId: string;
  readonly type: string;
};

type ProjectedReaction = {
  readonly item: Like | EmojiReact;
  readonly createdAt: Temporal.Instant;
  readonly id: string;
};

const parseCursor = (cursor: string | null): Cursor | null => {
  if (cursor === null || cursor === FIRST_CURSOR) {
    return { kind: 'first' };
  }
  if (!cursor.startsWith('v1:')) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(cursor.slice(3), 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof payload.createdAt !== 'string' || typeof payload.id !== 'string') {
      return null;
    }
    if (!isCanonicalPostId(payload.id)) {
      return null;
    }
    return {
      kind: 'after',
      createdAt: Temporal.Instant.from(payload.createdAt),
      id: payload.id,
    };
  } catch {
    return null;
  }
};

const encodeCursor = (createdAt: Temporal.Instant, id: string): string =>
  `v1:${Buffer.from(JSON.stringify({ createdAt: createdAt.toString(), id }), 'utf8').toString('base64url')}`;

// Authorized write paths store normalized HTTP(S) hrefs. Keep obvious non-HTTP or malformed rows
// out of the aggregate without materializing vocabulary objects just to count them.
const httpUriWhere = (column: SQLWrapper) =>
  sql`${column} ~ ${'^(https?)://[^/?#[:space:]]+([/?#].*)?$'}`;

const eligibleReactionWhere = (postId: string) =>
  and(
    eq(Reactions.postId, postId),
    inArray(Reactions.type, reactionTypes),
    eq(Profiles.state, ProfileState.ACTIVE),
    or(
      and(
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        isNotNull(Instances.canonicalOrigin),
      ),
      and(
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        ne(Instances.state, InstanceState.SUSPENDED),
        isNotNull(ActivityPubActors.uri),
        isNotNull(ActivityPubReactions.uri),
      ),
    ),
  );

const countableReactionWhere = (postId: string) =>
  and(
    eligibleReactionWhere(postId),
    or(
      and(eq(Instances.kind, InstanceKind.LOCAL), httpUriWhere(Instances.canonicalOrigin)),
      and(
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        httpUriWhere(ActivityPubActors.uri),
        httpUriWhere(ActivityPubReactions.uri),
      ),
    ),
  );

const loadReactionRows = async (
  postId: string,
  after: Extract<Cursor, { kind: 'after' }> | null,
  limit: number,
): Promise<ReactionRow[]> => {
  const afterWhere = after
    ? or(
        lt(Reactions.createdAt, after.createdAt),
        and(eq(Reactions.createdAt, after.createdAt), lt(Reactions.id, after.id)),
      )
    : undefined;
  return db
    .select({
      activityUri: ActivityPubReactions.uri,
      actorUri: ActivityPubActors.uri,
      createdAt: Reactions.createdAt,
      id: Reactions.id,
      instanceCanonicalOrigin: Instances.canonicalOrigin,
      instanceKind: Instances.kind,
      profileId: Reactions.profileId,
      type: Reactions.type,
    })
    .from(Reactions)
    .innerJoin(Profiles, eq(Profiles.id, Reactions.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .leftJoin(ActivityPubReactions, eq(ActivityPubReactions.reactionId, Reactions.id))
    .where(and(eligibleReactionWhere(postId), afterWhere))
    .orderBy(desc(Reactions.createdAt), desc(Reactions.id))
    .limit(limit);
};

const toHttpUrl = (value: string | null): URL | null => {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

const projectReaction = (
  row: ReactionRow,
  noteId: string,
  noteOrigin: string,
): ProjectedReaction | null => {
  const parsedType = reactionTypeSchema.safeParse(row.type);
  if (!parsedType.success) {
    return null;
  }

  let actor: URL;
  let activity: URL;
  if (row.instanceKind === InstanceKind.LOCAL) {
    const localOrigin = toHttpUrl(row.instanceCanonicalOrigin);
    if (!localOrigin) {
      return null;
    }
    actor = new URL(`/ap/actor/${row.profileId}`, localOrigin);
    activity = new URL(`/ap/reaction/${row.id}`, localOrigin);
  } else {
    const storedActor = toHttpUrl(row.actorUri);
    const storedActivity = toHttpUrl(row.activityUri);
    if (!storedActor || !storedActivity) {
      return null;
    }
    actor = storedActor;
    activity = storedActivity;
  }

  const options = {
    actor,
    content: parsedType.data,
    id: activity,
    object: new URL(`/ap/note/${noteId}`, noteOrigin),
    published: row.createdAt,
  };
  return {
    createdAt: row.createdAt,
    id: row.id,
    item: parsedType.data === '❤️' ? new Like(options) : new EmojiReact(options),
  };
};

export const dispatchLocalPostEmojiReactions = async (
  context: RequestContext<void>,
  { id }: { id: string },
  rawCursor: string | null,
): Promise<PageItems<Like | EmojiReact> | null> => {
  const note = await loadLocalPostNote(context, id);
  const cursor = parseCursor(rawCursor);
  if (!note || !cursor) {
    return null;
  }

  const after = cursor.kind === 'after' ? cursor : null;
  if (after) {
    // A cursor must identify a currently expressible row; otherwise clients receive a hidden
    // invalid page instead of silently jumping to a different collection boundary.
    const exact = await db
      .select({
        activityUri: ActivityPubReactions.uri,
        actorUri: ActivityPubActors.uri,
        createdAt: Reactions.createdAt,
        id: Reactions.id,
        instanceCanonicalOrigin: Instances.canonicalOrigin,
        instanceKind: Instances.kind,
        profileId: Reactions.profileId,
        type: Reactions.type,
      })
      .from(Reactions)
      .innerJoin(Profiles, eq(Profiles.id, Reactions.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
      .leftJoin(ActivityPubReactions, eq(ActivityPubReactions.reactionId, Reactions.id))
      .where(
        and(
          eligibleReactionWhere(note.id),
          eq(Reactions.id, after.id),
          eq(Reactions.createdAt, after.createdAt),
        ),
      )
      .limit(1)
      .then(first);
    if (!exact || !projectReaction(exact, note.id, note.canonicalOrigin)) {
      return null;
    }
  }

  const projected: ProjectedReaction[] = [];
  let rawAfter = after;
  let hasMoreRaw = false;
  while (projected.length <= PAGE_SIZE) {
    const rows = await loadReactionRows(note.id, rawAfter, PAGE_SIZE + 1);
    if (rows.length === 0) {
      hasMoreRaw = false;
      break;
    }
    for (const row of rows) {
      const item = projectReaction(row, note.id, note.canonicalOrigin);
      if (item) {
        projected.push(item);
      }
    }
    hasMoreRaw = rows.length === PAGE_SIZE + 1;
    if (projected.length > PAGE_SIZE || !hasMoreRaw) {
      break;
    }
    const last = rows.at(-1);
    if (!last) {
      break;
    }
    rawAfter = { kind: 'after', createdAt: last.createdAt, id: last.id };
  }

  const items = projected.slice(0, PAGE_SIZE);
  const lastItem = items.at(-1);
  return {
    items: items.map(({ item }) => item),
    ...((projected.length > PAGE_SIZE || hasMoreRaw) && lastItem
      ? { nextCursor: encodeCursor(lastItem.createdAt, lastItem.id) }
      : {}),
  };
};

export const countLocalPostEmojiReactions = async (
  context: RequestContext<void>,
  { id }: { id: string },
): Promise<number | null> => {
  const note = await loadLocalPostNote(context, id);
  if (!note) {
    return null;
  }
  const row = await db
    .select({ count: count() })
    .from(Reactions)
    .innerJoin(Profiles, eq(Profiles.id, Reactions.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .leftJoin(ActivityPubReactions, eq(ActivityPubReactions.reactionId, Reactions.id))
    .where(countableReactionWhere(note.id))
    .then(first);
  return row?.count ?? 0;
};

export const firstLocalPostEmojiReactionsCursor = async (
  context: RequestContext<void>,
  { id }: { id: string },
): Promise<string | null> => ((await loadLocalPostNote(context, id)) ? FIRST_CURSOR : null);
