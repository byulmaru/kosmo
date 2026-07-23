import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { ValidationError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt, or, sql } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { postVisibilityAccessWhere } from '../access/visibility';
import { Post, PostConnection } from '../ref';

type PostRow = typeof Posts.$inferSelect;

type ReplyDescendantCursor = {
  readonly createdAt: Temporal.Instant;
  readonly id: string;
};

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const encodeReplyDescendantCursor = ({ createdAt, id }: PostRow) =>
  Buffer.from(JSON.stringify([createdAt.toString(), id])).toString('base64url');

const decodeReplyDescendantCursor = (cursor: string): ReplyDescendantCursor => {
  try {
    if (!base64UrlPattern.test(cursor)) {
      throw new Error('Invalid base64url');
    }

    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) {
      throw new Error('Non-canonical base64url');
    }

    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== 'string' ||
      typeof value[1] !== 'string'
    ) {
      throw new Error('Invalid cursor payload');
    }

    const [createdAt, id] = value;
    parseUuid(id);

    return { createdAt: Temporal.Instant.from(createdAt), id };
  } catch {
    throw new ValidationError('Invalid Reply Descendant cursor');
  }
};

const replyDescendantCursorWhere = (cursor: string | undefined, direction: 'after' | 'before') => {
  if (!cursor) {
    return undefined;
  }

  const { createdAt, id } = decodeReplyDescendantCursor(cursor);

  return direction === 'after'
    ? or(gt(Posts.createdAt, createdAt), and(eq(Posts.createdAt, createdAt), gt(Posts.id, id)))
    : or(lt(Posts.createdAt, createdAt), and(eq(Posts.createdAt, createdAt), lt(Posts.id, id)));
};

const replyDescendantIds = (postId: string) => sql`
  WITH RECURSIVE reply_descendants(id, path) AS (
    SELECT child.id, ARRAY[${postId}::uuid, child.id]
    FROM post AS child
    WHERE child.reply_parent_id = ${postId}

    UNION ALL

    SELECT child.id, reply_descendants.path || child.id
    FROM post AS child
    INNER JOIN reply_descendants ON child.reply_parent_id = reply_descendants.id
    WHERE NOT child.id = ANY(reply_descendants.path)
  )
  SELECT id FROM reply_descendants
`;

builder.objectFields(Post, (t) => ({
  replyDescendants: t.connection(
    {
      type: Post,
      resolve: (post, args, ctx) =>
        resolveCursorConnection<Promise<PostRow[]>>(
          {
            args,
            toCursor: encodeReplyDescendantCursor,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select(getColumns(Posts))
              .from(Posts)
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  sql`${Posts.id} IN (${replyDescendantIds(post.id)})`,
                  postVisibilityAccessWhere({ ctx }),
                  replyDescendantCursorWhere(after, 'after'),
                  replyDescendantCursorWhere(before, 'before'),
                ),
              )
              .orderBy(
                inverted ? desc(Posts.createdAt) : asc(Posts.createdAt),
                inverted ? desc(Posts.id) : asc(Posts.id),
              )
              .limit(limit),
        ),
    },
    PostConnection,
  ),
}));
