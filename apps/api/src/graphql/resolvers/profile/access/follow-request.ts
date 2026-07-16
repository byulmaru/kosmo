import { ProfileFollowRequests } from '@kosmo/core/db';
import { eq, or } from 'drizzle-orm';
import type { UserContext } from '@/context';

export const profileFollowRequestAccessWhere = (ctx: UserContext) => {
  const viewerProfileId = ctx.session?.profileId;

  if (!viewerProfileId) {
    return undefined;
  }

  return or(
    eq(ProfileFollowRequests.followerProfileId, viewerProfileId),
    eq(ProfileFollowRequests.followeeProfileId, viewerProfileId),
  );
};
