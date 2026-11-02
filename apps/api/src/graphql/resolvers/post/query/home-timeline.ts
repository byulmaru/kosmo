import { db, Posts } from '@kosmo/core/db';
import { AccountProfileRole, PostState } from '@kosmo/core/enums';
import { readHomeTimelineCache, rebuildHomeTimeline } from '@kosmo/core/home-timeline/cache';
import { queryHomeTimeline } from '@kosmo/core/home-timeline/query';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, eq, exists, getColumns, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { builder } from '@/graphql/builder';
import { markCachedHomeTimelinePost, Post, PostConnection } from '../ref';
import type { HomeTimelineEntry } from '@kosmo/core/home-timeline/cache';

type PostRow = typeof Posts.$inferSelect;

const postIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CachedHomeRepostSources = alias(Posts, 'cached_home_timeline_repost_source');

type HomeCursor =
  | { readonly kind: 'db'; readonly postId: string }
  | { readonly kind: 'redis'; readonly score: number };

const parseHomeCursor = (cursor: string | undefined): HomeCursor | null | undefined => {
  if (cursor == null || cursor === '') {
    return undefined;
  }

  if (cursor.startsWith('redis:')) {
    const score = Number(cursor.slice('redis:'.length));
    return Number.isSafeInteger(score) && score >= 0 ? { kind: 'redis', score } : null;
  }

  const postId = cursor.startsWith('db:') ? cursor.slice('db:'.length) : cursor;
  return postIdPattern.test(postId) ? { kind: 'db', postId } : null;
};

const activeCachedPosts = async (
  entries: readonly HomeTimelineEntry[],
  scoresByRow: WeakMap<PostRow, number>,
): Promise<PostRow[]> => {
  if (entries.length === 0) {
    return [];
  }

  const sourceExistsForContentlessRepost = exists(
    db
      .select({ id: CachedHomeRepostSources.id })
      .from(CachedHomeRepostSources)
      .where(
        and(
          eq(CachedHomeRepostSources.id, Posts.repostSourceId),
          eq(CachedHomeRepostSources.state, PostState.ACTIVE),
          isNotNull(CachedHomeRepostSources.currentContentId),
        ),
      ),
  );
  const rows = await db
    .select(getColumns(Posts))
    .from(Posts)
    .where(
      and(
        inArray(
          Posts.id,
          entries.map(({ postId }) => postId),
        ),
        eq(Posts.state, PostState.ACTIVE),
        or(
          isNotNull(Posts.currentContentId),
          isNull(Posts.repostSourceId),
          sourceExistsForContentlessRepost,
        ),
      ),
    );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const orderedRows: PostRow[] = [];

  for (const entry of entries) {
    const row = rowsById.get(entry.postId);
    if (row) {
      markCachedHomeTimelinePost(row);
      scoresByRow.set(row, entry.score);
      orderedRows.push(row);
    }
  }

  return orderedRows;
};

const readCachedHomeTimeline = async ({
  after,
  before,
  inverted,
  limit,
  profileId,
}: {
  readonly after?: number;
  readonly before?: number;
  readonly inverted: boolean;
  readonly limit: number;
  readonly profileId: string;
}): Promise<{
  readonly rows: PostRow[];
  readonly scoresByRow: WeakMap<PostRow, number>;
} | null> => {
  const scoresByRow = new WeakMap<PostRow, number>();
  const rows: PostRow[] = [];
  let readLimit = limit;
  let read = await readHomeTimelineCacheSafely({
    profileId,
    after,
    before,
    limit: readLimit,
    inverted,
  });

  if (read === null) {
    return null;
  }

  let databaseBoundaryPostId = read.anchorPostId ?? read.oldestPostId;

  while (true) {
    const entries = read.entries;
    const cachedRows = await activeCachedPosts(entries, scoresByRow);
    rows.push(...cachedRows);

    const remaining = limit - rows.length;
    if (remaining <= 0) {
      break;
    }

    const lastEntry = entries.at(-1);
    if (lastEntry) {
      databaseBoundaryPostId = lastEntry.postId;
    }

    if (entries.length < readLimit || lastEntry === undefined) {
      break;
    }

    readLimit = remaining;
    read = await readHomeTimelineCacheSafely({
      profileId,
      after: inverted ? after : lastEntry.score,
      before: inverted ? lastEntry.score : before,
      limit: readLimit,
      inverted,
    });

    if (read === null) {
      break;
    }

    databaseBoundaryPostId = read.anchorPostId ?? databaseBoundaryPostId ?? read.oldestPostId;
  }

  const remaining = limit - rows.length;
  if (remaining > 0 && databaseBoundaryPostId) {
    const boundaryRows = await queryHomeTimeline({
      profileId,
      ...(inverted ? { before: databaseBoundaryPostId } : { after: databaseBoundaryPostId }),
      limit: remaining,
      inverted,
    });
    rows.push(...boundaryRows);
  }

  return { rows, scoresByRow };
};

const readHomeTimelineCacheSafely = async (options: {
  readonly after?: number;
  readonly before?: number;
  readonly inverted: boolean;
  readonly limit: number;
  readonly profileId: string;
}) => {
  try {
    return await readHomeTimelineCache(options);
  } catch {
    return null;
  }
};

builder.queryField('homeTimeline', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).connection(
    {
      type: Post,
      nullable: true,
      unauthorizedResolver: () => null,
      resolve: (_, args, ctx) => {
        let scoresByRow = new WeakMap<PostRow, number>();

        return resolveCursorConnection<Promise<PostRow[]>>(
          {
            args,
            toCursor: (post) => {
              const score = scoresByRow.get(post);
              return score === undefined ? `db:${post.id}` : `redis:${score}`;
            },
          },
          async ({ after: rawAfter, before: rawBefore, inverted, limit }) => {
            const after = parseHomeCursor(rawAfter);
            const before = parseHomeCursor(rawBefore);
            const compatibleCursors =
              after !== null &&
              before !== null &&
              (after === undefined || before === undefined || after.kind === before.kind);
            const cursorKind = after?.kind ?? before?.kind;
            const profileId = ctx.session.profile.id;
            let rebuildAfterDatabaseFallback = false;

            if (
              compatibleCursors &&
              (cursorKind === undefined || cursorKind === 'redis') &&
              process.env.REDIS_URL?.trim()
            ) {
              const cached = await readCachedHomeTimeline({
                profileId,
                after: after?.kind === 'redis' ? after.score : undefined,
                before: before?.kind === 'redis' ? before.score : undefined,
                limit,
                inverted,
              });
              if (cached !== null) {
                scoresByRow = cached.scoresByRow;
                return cached.rows;
              }

              rebuildAfterDatabaseFallback = true;
            }

            const rows = await queryHomeTimeline({
              profileId,
              after:
                compatibleCursors && after?.kind === 'db' && cursorKind === 'db'
                  ? after.postId
                  : undefined,
              before:
                compatibleCursors && before?.kind === 'db' && cursorKind === 'db'
                  ? before.postId
                  : undefined,
              limit,
              inverted,
            });
            if (rebuildAfterDatabaseFallback) {
              void rebuildHomeTimeline({ profileId }).catch(() => {});
            }
            return rows;
          },
        );
      },
    },
    PostConnection as never,
  ),
);
