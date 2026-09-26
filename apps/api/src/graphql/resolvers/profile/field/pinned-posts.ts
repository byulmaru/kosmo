import { db, Instances, Posts, ProfilePinnedPosts, Profiles } from '@kosmo/core/db';
import { ValidationError } from '@kosmo/core/error';
import { profilePostListAccessWhere } from '@kosmo/core/visibility';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { Post, PostConnection } from '../../post/ref';
import { Profile } from '../ref';

type PinnedPostRow = typeof Posts.$inferSelect & {
  readonly pinId: string;
};

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

  const compare = direction === 'after' ? gt : lt;
  return compare(ProfilePinnedPosts.id, decodePinnedPostCursor(cursor));
};

builder.objectField(Profile, 'pinnedPosts', (t) =>
  t.connection(
    {
      type: Post,
      resolve: (profile, args, ctx) =>
        resolveCursorConnection<Promise<PinnedPostRow[]>>(
          {
            args,
            toCursor: ({ pinId }) => pinId,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select({
                ...getColumns(Posts),
                pinId: ProfilePinnedPosts.id,
              })
              .from(ProfilePinnedPosts)
              .innerJoin(Posts, eq(Posts.id, ProfilePinnedPosts.postId))
              .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(ProfilePinnedPosts.profileId, profile.id),
                  profilePostListAccessWhere({
                    db,
                    visitedProfileId: profile.id,
                    viewerProfileId: ctx.session?.profile?.id,
                  }),
                  pinnedPostCursorWhere(after, 'after'),
                  pinnedPostCursorWhere(before, 'before'),
                ),
              )
              .orderBy(inverted ? desc(ProfilePinnedPosts.id) : asc(ProfilePinnedPosts.id))
              .limit(limit),
        ),
    },
    PostConnection,
  ),
);
