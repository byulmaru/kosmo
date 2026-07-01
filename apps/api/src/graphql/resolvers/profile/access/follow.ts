import { ProfileFollows } from '@kosmo/core/db';
import { ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
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
  const publicFollowWhere = and(
    eq(followerProfile.followPolicy, ProfileFollowPolicy.OPEN),
    eq(followeeProfile.followPolicy, ProfileFollowPolicy.OPEN),
  )!;
  const visibleWhere = ctx.session?.profileId
    ? or(
        eq(ProfileFollows.followerProfileId, ctx.session.profileId),
        eq(ProfileFollows.followeeProfileId, ctx.session.profileId),
        publicFollowWhere,
      )
    : publicFollowWhere;

  return and(
    eq(followerProfile.state, ProfileState.ACTIVE),
    eq(followeeProfile.state, ProfileState.ACTIVE),
    visibleWhere,
  )!;
};
