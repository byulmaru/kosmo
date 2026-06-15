import { db, Posts, ProfileFollows } from '@kosmo/core/db';
import { PostState, PostVisibility, ProfileFollowState, ProfileState } from '@kosmo/core/enums';
import { and, eq, exists, inArray, or } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { UserContext } from '@/context';

type PostVisibilityAccessProfile = {
  state: AnyPgColumn;
};

export const postVisibilityAccessWhere = ({
  authorProfile,
  ctx,
}: {
  authorProfile?: PostVisibilityAccessProfile;
  ctx: UserContext;
}) => {
  const publicWhere = inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]);
  const acceptedFollowerWhere = ctx.session?.profileId
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
                eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
              ),
            ),
        ),
      )
    : undefined;
  const visibleWhere = ctx.session?.profileId
    ? or(publicWhere, eq(Posts.profileId, ctx.session.profileId), acceptedFollowerWhere)!
    : publicWhere;
  const authorProfileWhere = authorProfile
    ? eq(authorProfile.state, ProfileState.ACTIVE)
    : undefined;

  // TODO(PROD-121): Extend this helper with DIRECT access once recipient policy exists.
  return and(eq(Posts.state, PostState.ACTIVE), authorProfileWhere, visibleWhere)!;
};
