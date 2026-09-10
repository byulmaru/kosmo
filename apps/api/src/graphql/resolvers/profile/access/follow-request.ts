import { db, ProfileFollowRequests } from '@kosmo/core/db';
import { profileBlockVisibilityWhere } from '@kosmo/core/visibility';
import { and, eq, or } from 'drizzle-orm';
import type { UserContext } from '@/context';

export const profileFollowRequestAccessWhere = (ctx: UserContext) => {
  const viewerProfileId = ctx.session?.profile?.id;

  if (!viewerProfileId) {
    return undefined;
  }

  return and(
    or(
      eq(ProfileFollowRequests.followerProfileId, viewerProfileId),
      eq(ProfileFollowRequests.followeeProfileId, viewerProfileId),
    ),
    profileBlockVisibilityWhere({
      database: db,
      ownerProfileId: ProfileFollowRequests.followerProfileId,
      targetProfileId: ProfileFollowRequests.followeeProfileId,
    }),
    profileBlockVisibilityWhere({
      database: db,
      ownerProfileId: ProfileFollowRequests.followeeProfileId,
      targetProfileId: ProfileFollowRequests.followerProfileId,
    }),
  );
};
