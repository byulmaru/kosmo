import { db, Instances, ProfileFollows, Profiles } from '@kosmo/core/db';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { builder } from '@/graphql/builder';
import { profileFollowAccessWhere } from '../access/follow';
import { viewerFollowLoader } from '../loader/follow';
import { Profile, ProfileFollow } from '../ref';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

const FollowerProfiles = alias(Profiles, 'profile_follow_connection_follower_profile');
const FolloweeProfiles = alias(Profiles, 'profile_follow_connection_followee_profile');
const FollowerInstances = alias(Instances, 'profile_follow_connection_follower_instance');
const FolloweeInstances = alias(Instances, 'profile_follow_connection_followee_instance');
const ProfileViewerState = builder.simpleObject('ProfileViewerState', {
  fields: (field) => ({
    isSelf: field.boolean(),
    follow: field.field({ type: ProfileFollow, nullable: true }),
  }),
});

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
            .leftJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
            .leftJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
            .where(
              and(
                eq(ProfileFollows.followeeProfileId, profile.id),
                before ? gt(ProfileFollows.id, before) : undefined,
                after ? lt(ProfileFollows.id, after) : undefined,
                profileFollowAccessWhere({
                  ctx,
                  followerInstance: FollowerInstances,
                  followerProfile: FollowerProfiles,
                  followeeInstance: FolloweeInstances,
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
            .leftJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
            .leftJoin(FolloweeInstances, eq(FolloweeInstances.id, FolloweeProfiles.instanceId))
            .where(
              and(
                eq(ProfileFollows.followerProfileId, profile.id),
                before ? gt(ProfileFollows.id, before) : undefined,
                after ? lt(ProfileFollows.id, after) : undefined,
                profileFollowAccessWhere({
                  ctx,
                  followerInstance: FollowerInstances,
                  followerProfile: FollowerProfiles,
                  followeeInstance: FolloweeInstances,
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
    resolve: (profile) => profile.followersCount,
  }),
  followingCount: t.int({
    resolve: (profile) => profile.followingCount,
  }),
  viewerFollow: t.field({
    type: ProfileFollow,
    nullable: true,
    resolve: (profile, _, ctx) => viewerFollowLoader(ctx).load(profile.id),
  }),
  viewerState: t.withAuth({ usingProfile: true }).field({
    type: ProfileViewerState,
    nullable: true,
    unauthorizedResolver: () => null,
    resolve: async (profile, _, ctx) => {
      const viewerProfileId = ctx.session.profileId;
      return {
        isSelf: viewerProfileId === profile.id,
        follow: await viewerFollowLoader(ctx).load(profile.id),
      };
    },
  }),
}));
