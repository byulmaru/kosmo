import { db, ProfileFollows, Profiles } from '@kosmo/core/db';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { isConfiguredLocalProfile } from '@kosmo/core/profile';
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
      const configuredLocalInstance = await resolveConfiguredLocalInstance();

      if (!isConfiguredLocalProfile(profile, configuredLocalInstance)) {
        return resolveCursorConnection<Promise<ProfileFollowRow[]>>(
          {
            args,
            toCursor: (profileFollow) => profileFollow.id,
          },
          async () => [],
        );
      }

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
                before ? gt(ProfileFollows.id, before) : undefined,
                after ? lt(ProfileFollows.id, after) : undefined,
                profileFollowAccessWhere({
                  configuredLocalInstanceId: configuredLocalInstance.id,
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
      const configuredLocalInstance = await resolveConfiguredLocalInstance();

      if (!isConfiguredLocalProfile(profile, configuredLocalInstance)) {
        return resolveCursorConnection<Promise<ProfileFollowRow[]>>(
          {
            args,
            toCursor: (profileFollow) => profileFollow.id,
          },
          async () => [],
        );
      }

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
                before ? gt(ProfileFollows.id, before) : undefined,
                after ? lt(ProfileFollows.id, after) : undefined,
                profileFollowAccessWhere({
                  configuredLocalInstanceId: configuredLocalInstance.id,
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
      const configuredLocalInstance = await resolveConfiguredLocalInstance();

      return isConfiguredLocalProfile(profile, configuredLocalInstance)
        ? profile.followersCount
        : 0;
    },
  }),
  followingCount: t.int({
    resolve: async (profile) => {
      const configuredLocalInstance = await resolveConfiguredLocalInstance();

      return isConfiguredLocalProfile(profile, configuredLocalInstance)
        ? profile.followingCount
        : 0;
    },
  }),
  viewerFollow: t.field({
    type: ProfileFollow,
    nullable: true,
    resolve: async (profile, _, ctx) => {
      const configuredLocalInstance = await resolveConfiguredLocalInstance();

      if (!isConfiguredLocalProfile(profile, configuredLocalInstance)) {
        return null;
      }

      return viewerFollowLoader(ctx).load(profile.id);
    },
  }),
  viewerState: t.withAuth({ usingProfile: true }).field({
    type: ProfileViewerState,
    nullable: true,
    unauthorizedResolver: () => null,
    resolve: async (profile, _, ctx) => {
      const viewerProfileId = ctx.session.profileId;
      const configuredLocalInstance = await resolveConfiguredLocalInstance();

      if (!isConfiguredLocalProfile(profile, configuredLocalInstance)) {
        return {
          isSelf: false,
          follow: null,
        };
      }

      return {
        isSelf: viewerProfileId === profile.id,
        follow: await viewerFollowLoader(ctx).load(profile.id),
      };
    },
  }),
}));
