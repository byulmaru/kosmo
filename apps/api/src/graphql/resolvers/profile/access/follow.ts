import { ProfileFollows } from '@kosmo/core/db';
import { ProfileFollowPolicy, ProfileFollowState, ProfileState } from '@kosmo/core/enums';
import { and, eq, or } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { UserContext } from '@/context';

type ProfileFollowAccessProfile = {
  followPolicy: AnyPgColumn;
  state: AnyPgColumn;
};

export const profileFollowAccessWhere = ({
  ctx,
  followerProfile,
  followeeProfile,
}: {
  ctx: UserContext;
  followerProfile: ProfileFollowAccessProfile;
  followeeProfile: ProfileFollowAccessProfile;
}) => {
  const publicAcceptedWhere = and(
    eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
    eq(followerProfile.followPolicy, ProfileFollowPolicy.OPEN),
    eq(followeeProfile.followPolicy, ProfileFollowPolicy.OPEN),
  )!;
  const visibleWhere = ctx.session?.profileId
    ? or(
        eq(ProfileFollows.followerProfileId, ctx.session.profileId),
        eq(ProfileFollows.followeeProfileId, ctx.session.profileId),
        publicAcceptedWhere,
      )
    : publicAcceptedWhere;

  return and(
    eq(followerProfile.state, ProfileState.ACTIVE),
    eq(followeeProfile.state, ProfileState.ACTIVE),
    visibleWhere,
  )!;
};
