import { db, Instances, Posts, ProfileFollows, Profiles } from '@kosmo/core/db';
import { PostState, PostVisibility } from '@kosmo/core/enums';
import { and, eq, exists, inArray, or } from 'drizzle-orm';
import { visibleProfileWhere } from '../../profile/access/visibility';
import type { UserContext } from '@/context';

export const postVisibilityAccessWhere = ({ ctx }: { ctx: UserContext }) => {
  const publicWhere = inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]);
  const followerWhere = ctx.session?.profileId
    ? and(
        eq(Posts.visibility, PostVisibility.FOLLOWERS),
        exists(
          db
            .select({ id: ProfileFollows.id })
            .from(ProfileFollows)
            .where(
              and(
                eq(ProfileFollows.followerProfileId, ctx.session.profileId),
                eq(ProfileFollows.followeeProfileId, Posts.profileId),
              ),
            ),
        ),
      )
    : undefined;
  const visibleWhere = ctx.session?.profileId
    ? or(publicWhere, eq(Posts.profileId, ctx.session.profileId), followerWhere)!
    : publicWhere;

  // TODO(PROD-121): Extend this helper with DIRECT access once recipient policy exists.
  return and(
    eq(Posts.state, PostState.ACTIVE),
    visibleProfileWhere({ profile: Profiles, instance: Instances }),
    visibleWhere,
  )!;
};
