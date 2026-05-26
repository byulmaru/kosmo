import { db, first, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileFollowState, ProfileState } from '@kosmo/core/enums';
import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { and, count, desc, eq, getColumns } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile, ProfileFollow } from '../ref';
import type { SQL } from 'drizzle-orm';

const countFollows = async (where: SQL, joinOn: SQL) => {
  const row = await db
    .select({ value: count() })
    .from(ProfileFollows)
    .innerJoin(Profiles, joinOn)
    .where(where)
    .then(first);

  return row?.value ?? 0;
};

builder.objectFields(ProfileFollow, (t) => ({
  follower: t.field({
    type: Profile,
    nullable: true,
    resolve: (follow) => follow.followerProfileId,
  }),
  followee: t.field({
    type: Profile,
    nullable: true,
    resolve: (follow) => follow.followeeProfileId,
  }),
}));

builder.objectFields(Profile, (t) => ({
  followers: t.connection({
    type: ProfileFollow,
    resolve: async (profile, args) => {
      const joinOn = eq(Profiles.id, ProfileFollows.followerProfileId);
      const where = and(
        eq(ProfileFollows.followeeProfileId, profile.id),
        eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
        eq(Profiles.state, ProfileState.ACTIVE),
      )!;

      return resolveOffsetConnection(
        { args, totalCount: await countFollows(where, joinOn) },
        ({ limit, offset }) =>
          db
            .select(getColumns(ProfileFollows))
            .from(ProfileFollows)
            .innerJoin(Profiles, joinOn)
            .where(where)
            .orderBy(desc(ProfileFollows.id))
            .limit(limit)
            .offset(offset),
      );
    },
  }),
  following: t.connection({
    type: ProfileFollow,
    resolve: async (profile, args) => {
      const joinOn = eq(Profiles.id, ProfileFollows.followeeProfileId);
      const where = and(
        eq(ProfileFollows.followerProfileId, profile.id),
        eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
        eq(Profiles.state, ProfileState.ACTIVE),
      )!;

      return resolveOffsetConnection(
        { args, totalCount: await countFollows(where, joinOn) },
        ({ limit, offset }) =>
          db
            .select(getColumns(ProfileFollows))
            .from(ProfileFollows)
            .innerJoin(Profiles, joinOn)
            .where(where)
            .orderBy(desc(ProfileFollows.id))
            .limit(limit)
            .offset(offset),
      );
    },
  }),
  followersCount: t.int({
    resolve: (profile) =>
      countFollows(
        and(
          eq(ProfileFollows.followeeProfileId, profile.id),
          eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
          eq(Profiles.state, ProfileState.ACTIVE),
        )!,
        eq(Profiles.id, ProfileFollows.followerProfileId),
      ),
  }),
  followingCount: t.int({
    resolve: (profile) =>
      countFollows(
        and(
          eq(ProfileFollows.followerProfileId, profile.id),
          eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
          eq(Profiles.state, ProfileState.ACTIVE),
        )!,
        eq(Profiles.id, ProfileFollows.followeeProfileId),
      ),
  }),
  viewerFollowState: t.field({
    type: ProfileFollowState,
    nullable: true,
    resolve: async (profile, _, ctx) => {
      if (!ctx.session?.profileId) {
        return null;
      }

      const follow = await db
        .select({ state: ProfileFollows.state })
        .from(ProfileFollows)
        .where(
          and(
            eq(ProfileFollows.followerProfileId, ctx.session.profileId),
            eq(ProfileFollows.followeeProfileId, profile.id),
          ),
        )
        .limit(1)
        .then(first);

      return follow?.state ?? null;
    },
  }),
}));
