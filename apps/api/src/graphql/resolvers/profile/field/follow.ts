import { db, first, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileFollowState, ProfileState } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, count, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { builder } from '@/graphql/builder';
import { profileFollowAccessWhere } from '../access/follow';
import { viewerFollowLoader } from '../loader/follow';
import { Profile, ProfileFollow } from '../ref';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

const FollowerProfiles = alias(Profiles, 'profile_follow_connection_follower_profile');
const FolloweeProfiles = alias(Profiles, 'profile_follow_connection_followee_profile');

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
    resolve: async (profile, args, ctx) => {
      return resolveCursorConnection<Promise<ProfileFollowRow[]>>(
        {
          args,
          toCursor: (profileFollow) => profileFollow.id,
        },
        async ({ before, after, limit, inverted }) => {
          return await db
            .select(getColumns(ProfileFollows))
            .from(ProfileFollows)
            .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
            .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, ProfileFollows.followeeProfileId))
            .where(
              and(
                eq(ProfileFollows.followeeProfileId, profile.id),
                eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
                before ? gt(ProfileFollows.id, before) : undefined,
                after ? lt(ProfileFollows.id, after) : undefined,
                profileFollowAccessWhere({
                  ctx,
                  followerProfile: FollowerProfiles,
                  followeeProfile: FolloweeProfiles,
                }),
              ),
            )
            .orderBy(inverted ? asc(ProfileFollows.id) : desc(ProfileFollows.id))
            .limit(limit);
        },
      );
    },
  }),
  following: t.connection({
    type: ProfileFollow,
    resolve: async (profile, args, ctx) => {
      return resolveCursorConnection<Promise<ProfileFollowRow[]>>(
        {
          args,
          toCursor: (profileFollow) => profileFollow.id,
        },
        async ({ before, after, limit, inverted }) => {
          return await db
            .select(getColumns(ProfileFollows))
            .from(ProfileFollows)
            .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
            .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, ProfileFollows.followeeProfileId))
            .where(
              and(
                eq(ProfileFollows.followerProfileId, profile.id),
                eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
                before ? gt(ProfileFollows.id, before) : undefined,
                after ? lt(ProfileFollows.id, after) : undefined,
                profileFollowAccessWhere({
                  ctx,
                  followerProfile: FollowerProfiles,
                  followeeProfile: FolloweeProfiles,
                }),
              ),
            )
            .orderBy(inverted ? asc(ProfileFollows.id) : desc(ProfileFollows.id))
            .limit(limit);
        },
      );
    },
  }),
  followersCount: t.int({
    resolve: async (profile) => {
      const row = await db
        .select({ value: count() })
        .from(ProfileFollows)
        .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
        .where(
          and(
            eq(ProfileFollows.followeeProfileId, profile.id),
            eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
            eq(FollowerProfiles.state, ProfileState.ACTIVE),
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
        .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, ProfileFollows.followeeProfileId))
        .where(
          and(
            eq(ProfileFollows.followerProfileId, profile.id),
            eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
            eq(FolloweeProfiles.state, ProfileState.ACTIVE),
          ),
        )
        .then(first);

      return row?.value ?? 0;
    },
  }),
  viewerFollow: t.field({
    type: ProfileFollow,
    nullable: true,
    resolve: (profile, _, ctx) => viewerFollowLoader(ctx).load(profile.id),
  }),
}));
