import { db, Instances, Posts, ProfilePins, Profiles } from '@kosmo/core/db';
import { ValidationError } from '@kosmo/core/error';
import { profilePostListAccessWhere } from '@kosmo/core/visibility';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, isNull, lt } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { Post, PostConnection } from '../ref';

type PostRow = typeof Posts.$inferSelect;

type PinnedPostRow = PostRow & {
  readonly pinId: string;
};

const encodePinnedPostCursor = ({ pinId }: PinnedPostRow) => pinId;

const decodePinnedPostCursor = (cursor: string) => {
  try {
    parseUuid(cursor);
    return cursor;
  } catch {
    throw new ValidationError('Invalid Pinned Post cursor');
  }
};

const pinnedPostCursorWhere = (cursor: string | undefined, direction: 'after' | 'before') => {
  if (!cursor) {
    return undefined;
  }

  const id = decodePinnedPostCursor(cursor);
  const compare = direction === 'after' ? gt : lt;

  return compare(ProfilePins.id, id);
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
              })
              .from(ProfilePins)
              .innerJoin(Posts, eq(Posts.id, ProfilePins.postId))
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(ProfilePins.profileId, profile.id),
                  profilePostListAccessWhere({
                    db,
                    visitedProfileId: profile.id,
                    viewerProfileId: ctx.session?.profile?.id,
                  }),
                  pinnedPostCursorWhere(after, 'after'),
                  pinnedPostCursorWhere(before, 'before'),
                ),
              )
              .orderBy(inverted ? desc(ProfilePins.id) : asc(ProfilePins.id))
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
                  profilePostListAccessWhere({
                    db,
                    visitedProfileId: profile.id,
                    viewerProfileId: ctx.session?.profile?.id,
                  }),
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
