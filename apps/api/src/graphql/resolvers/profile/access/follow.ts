import { ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileFollowPolicy, ProfileFollowState, ProfileState } from '@kosmo/core/enums';
import { and, eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { UserContext } from '@/context';

export const ProfileFollowFollowerProfiles = alias(Profiles, 'profile_follow_follower_profile');
export const ProfileFollowFolloweeProfiles = alias(Profiles, 'profile_follow_followee_profile');

export const profileFollowAccessWhere = (ctx: UserContext, where: (SQL | undefined)[] = []) => {
  const publicAcceptedWhere = and(
    eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
    eq(ProfileFollowFollowerProfiles.followPolicy, ProfileFollowPolicy.OPEN),
    eq(ProfileFollowFolloweeProfiles.followPolicy, ProfileFollowPolicy.OPEN),
  )!;
  const visibleWhere = ctx.session?.profileId
    ? or(
        eq(ProfileFollows.followerProfileId, ctx.session.profileId),
        eq(ProfileFollows.followeeProfileId, ctx.session.profileId),
        publicAcceptedWhere,
      )
    : publicAcceptedWhere;

  return and(
    ...where,
    eq(ProfileFollowFollowerProfiles.state, ProfileState.ACTIVE),
    eq(ProfileFollowFolloweeProfiles.state, ProfileState.ACTIVE),
    visibleWhere,
  )!;
};
