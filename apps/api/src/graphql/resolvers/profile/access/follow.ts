import { db, ProfileFollows } from '@kosmo/core/db';
import { InstanceState, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { profileBlockVisibilityWhere } from '@kosmo/core/visibility';
import { and, eq, ne, or } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { UserContext } from '@/context';

type ProfileFollowAccessProfile = {
  followPolicy: AnyPgColumn;
  state: AnyPgColumn;
};

type ProfileFollowAccessInstance = {
  state: AnyPgColumn;
};

export const profileFollowAccessWhere = ({
  ctx,
  followerInstance,
  followerProfile,
  followeeInstance,
  followeeProfile,
}: {
  ctx: UserContext;
  followerInstance: ProfileFollowAccessInstance;
  followerProfile: ProfileFollowAccessProfile;
  followeeInstance: ProfileFollowAccessInstance;
  followeeProfile: ProfileFollowAccessProfile;
}) => {
  const publicFollowWhere = and(
    eq(followerProfile.followPolicy, ProfileFollowPolicy.OPEN),
    eq(followeeProfile.followPolicy, ProfileFollowPolicy.OPEN),
  )!;
  const visibleWhere = ctx.session?.profile?.id
    ? or(
        eq(ProfileFollows.followerProfileId, ctx.session.profile.id),
        eq(ProfileFollows.followeeProfileId, ctx.session.profile.id),
        publicFollowWhere,
      )
    : publicFollowWhere;

  return and(
    eq(followerProfile.state, ProfileState.ACTIVE),
    eq(followeeProfile.state, ProfileState.ACTIVE),
    ne(followerInstance.state, InstanceState.SUSPENDED),
    ne(followeeInstance.state, InstanceState.SUSPENDED),
    profileBlockVisibilityWhere({
      database: db,
      firstProfileId: ProfileFollows.followerProfileId,
      secondProfileId: ProfileFollows.followeeProfileId,
    }),
    visibleWhere,
  )!;
};
