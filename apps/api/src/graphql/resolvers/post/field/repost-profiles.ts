import { db, Instances, Posts, Profiles } from '@kosmo/core/db';
import { PostState } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { profilePostListAccessWhere } from '@kosmo/core/visibility';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, isNull, lt, or } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { Profile, ProfileConnection } from '@/graphql/resolvers/profile';
import { directPostAccessWhere } from '../access';
import { Post } from '../ref';

type RepostProfileRow = typeof Profiles.$inferSelect & {
  readonly repostCreatedAt: Temporal.Instant;
  readonly repostId: string;
};

type RepostProfileCursor = {
  readonly createdAt: Temporal.Instant;
  readonly id: string;
};

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const encodeRepostProfileCursor = ({ repostCreatedAt, repostId }: RepostProfileRow) =>
  Buffer.from(JSON.stringify([repostCreatedAt.toString(), repostId])).toString('base64url');

const decodeRepostProfileCursor = (cursor: string): RepostProfileCursor => {
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
    throw new ValidationError('Invalid Repost Profile cursor');
  }
};

const repostProfileCursorWhere = (cursor: string | undefined, direction: 'after' | 'before') => {
  if (!cursor) {
    return undefined;
  }

  const { createdAt, id } = decodeRepostProfileCursor(cursor);

  return direction === 'after'
    ? or(lt(Posts.createdAt, createdAt), and(eq(Posts.createdAt, createdAt), lt(Posts.id, id)))
    : or(gt(Posts.createdAt, createdAt), and(eq(Posts.createdAt, createdAt), gt(Posts.id, id)));
};

builder.objectFields(Post, (t) => ({
  repostProfiles: t.connection(
    {
      type: Profile,
      nullable: true,
      resolve: async (post, args, ctx) => {
        if (ctx.session?.profile?.id !== post.profileId) {
          return null;
        }

        const source = await db
          .select({ id: Posts.id })
          .from(Posts)
          .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .where(and(eq(Posts.id, post.id), directPostAccessWhere({ ctx, profileMute: 'ignore' })))
          .limit(1);

        if (source.length === 0) {
          return null;
        }

        return resolveCursorConnection<Promise<RepostProfileRow[]>>(
          {
            args,
            toCursor: encodeRepostProfileCursor,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select({
                ...getColumns(Profiles),
                repostCreatedAt: Posts.createdAt,
                repostId: Posts.id,
              })
              .from(Posts)
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(Posts.repostSourceId, post.id),
                  eq(Posts.state, PostState.ACTIVE),
                  isNull(Posts.currentContentId),
                  isNull(Posts.replyParentId),
                  profilePostListAccessWhere({
                    db,
                    visitedProfileId: post.profileId,
                    viewerProfileId: ctx.session?.profile?.id,
                  }),
                  repostProfileCursorWhere(after, 'after'),
                  repostProfileCursorWhere(before, 'before'),
                ),
              )
              .orderBy(
                inverted ? asc(Posts.createdAt) : desc(Posts.createdAt),
                inverted ? asc(Posts.id) : desc(Posts.id),
              )
              .limit(limit),
        );
      },
    },
    ProfileConnection,
  ),
}));
