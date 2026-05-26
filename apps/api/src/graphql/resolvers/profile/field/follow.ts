import { db, first, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileFollowState, ProfileState } from '@kosmo/core/enums';
import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { and, count, desc, eq, getColumns } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile, ProfileFollow } from '../ref';

const acceptedFollow = eq(ProfileFollows.state, ProfileFollowState.ACCEPTED);

builder.objectFields(ProfileFollow, (t) => ({
  follower: t.field({
    type: Profile,
    resolve: (follow) => follow.followerProfileId,
  }),
  followee: t.field({
    type: Profile,
    resolve: (follow) => follow.followeeProfileId,
  }),
}));

builder.objectFields(Profile, (t) => ({
  followers: t.connection({
    type: ProfileFollow,
    resolve: (profile, args) =>
      resolveOffsetConnection({ args }, ({ limit, offset }) =>
        db
          .select(getColumns(ProfileFollows))
          .from(ProfileFollows)
          .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followerProfileId))
          .where(
            and(
              eq(ProfileFollows.followeeProfileId, profile.id),
              acceptedFollow,
              eq(Profiles.state, ProfileState.ACTIVE),
            ),
          )
          .orderBy(desc(ProfileFollows.createdAt), desc(ProfileFollows.id))
          .limit(limit)
          .offset(offset),
      ),
  }),
  following: t.connection({
    type: ProfileFollow,
    resolve: (profile, args) =>
      resolveOffsetConnection({ args }, ({ limit, offset }) =>
        db
          .select(getColumns(ProfileFollows))
          .from(ProfileFollows)
          .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followeeProfileId))
          .where(
            and(
              eq(ProfileFollows.followerProfileId, profile.id),
              acceptedFollow,
              eq(Profiles.state, ProfileState.ACTIVE),
            ),
          )
          .orderBy(desc(ProfileFollows.createdAt), desc(ProfileFollows.id))
          .limit(limit)
          .offset(offset),
      ),
  }),
  followersCount: t.int({
    resolve: async (profile) => {
      const row = await db
        .select({ value: count() })
        .from(ProfileFollows)
        .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followerProfileId))
        .where(
          and(
            eq(ProfileFollows.followeeProfileId, profile.id),
            acceptedFollow,
            eq(Profiles.state, ProfileState.ACTIVE),
          ),
        )
        .then(first);

      return row?.value ?? 0;
    },
  }),
  followingCount: t.int({
    resolve: async (profile) => {
      const row = await db
        .select({ value: count() })
        .from(ProfileFollows)
        .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.followeeProfileId))
        .where(
          and(
            eq(ProfileFollows.followerProfileId, profile.id),
            acceptedFollow,
            eq(Profiles.state, ProfileState.ACTIVE),
          ),
        )
        .then(first);

      return row?.value ?? 0;
    },
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
