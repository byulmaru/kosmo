import { db, Instances, Posts, ProfilePins, Profiles } from '@kosmo/core/db';
import { ValidationError } from '@kosmo/core/error';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, isNull, lt, or } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { postAccessWhere } from '../access';
import { Post, PostConnection } from '../ref';

type PostRow = typeof Posts.$inferSelect;

type PinnedPostRow = PostRow & {
  readonly pinId: string;
  readonly pinOrderKey: bigint;
};

type PinnedPostCursor = {
  readonly id: string;
  readonly orderKey: bigint;
};

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const encodePinnedPostCursor = ({ pinId, pinOrderKey }: PinnedPostRow) =>
  Buffer.from(JSON.stringify([pinOrderKey.toString(), pinId])).toString('base64url');

const decodePinnedPostCursor = (cursor: string): PinnedPostCursor => {
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

    const [orderKey, id] = value;
    parseUuid(id);
    return { id, orderKey: BigInt(orderKey) };
  } catch {
    throw new ValidationError('Invalid Pinned Post cursor');
  }
};

const pinnedPostCursorWhere = (cursor: string | undefined, direction: 'after' | 'before') => {
  if (!cursor) {
    return undefined;
  }

  const { id, orderKey } = decodePinnedPostCursor(cursor);
  const compare = direction === 'after' ? gt : lt;

  return or(
    compare(ProfilePins.orderKey, orderKey),
    and(eq(ProfilePins.orderKey, orderKey), compare(ProfilePins.id, id)),
  );
};

builder.objectFields(Profile, (t) => ({
  pinnedPosts: t.connection(
    {
      type: Post,
      resolve: (profile, args, ctx) =>
        resolveCursorConnection<Promise<PinnedPostRow[]>>(
          {
            args,
            toCursor: encodePinnedPostCursor,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select({
                ...getColumns(Posts),
                pinId: ProfilePins.id,
                pinOrderKey: ProfilePins.orderKey,
              })
              .from(ProfilePins)
              .innerJoin(Posts, eq(Posts.id, ProfilePins.postId))
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(ProfilePins.profileId, profile.id),
                  postAccessWhere({ ctx, profileMute: { excludeExcept: profile.id } }),
                  pinnedPostCursorWhere(after, 'after'),
                  pinnedPostCursorWhere(before, 'before'),
                ),
              )
              .orderBy(
                inverted ? desc(ProfilePins.orderKey) : asc(ProfilePins.orderKey),
                inverted ? desc(ProfilePins.id) : asc(ProfilePins.id),
              )
              .limit(limit),
        ),
    },
    PostConnection,
  ),
  posts: t.connection(
    {
      type: Post,
      resolve: (profile, args, ctx) => {
        const connectionOptions = {
          args,
          toCursor: (post: PostRow) => post.id,
        };

        return resolveCursorConnection<Promise<PostRow[]>>(
          connectionOptions,
          ({ before, after, limit, inverted }) =>
            db
              .select(getColumns(Posts))
              .from(Posts)
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(Posts.profileId, profile.id),
                  postAccessWhere({ ctx, profileMute: { excludeExcept: profile.id } }),
                  isNull(Posts.replyParentId),
                  before ? gt(Posts.id, before) : undefined,
                  after ? lt(Posts.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(Posts.id) : desc(Posts.id))
              .limit(limit),
        );
      },
    },
    PostConnection,
  ),
}));
