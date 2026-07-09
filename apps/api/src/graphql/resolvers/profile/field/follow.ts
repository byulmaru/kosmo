import { db, first, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { isConfiguredLocalProfile } from '@kosmo/core/profile';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, count, desc, eq, getColumns, gt, isNull, lt, or } from 'drizzle-orm';
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

      if (!isConfiguredLocalProfile(profile, configuredLocalInstance)) {
        return 0;
      }

      // TODO: follower 수를 Profile DB 컬럼으로 옮기면 이 count 쿼리를 제거한다.
      const row = await db
        .select({ value: count() })
        .from(ProfileFollows)
        .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
        .where(
          and(
            eq(ProfileFollows.followeeProfileId, profile.id),
            eq(FollowerProfiles.state, ProfileState.ACTIVE),
            or(
              isNull(FollowerProfiles.instanceId),
              eq(FollowerProfiles.instanceId, configuredLocalInstance.id),
            ),
          ),
        )
        .then(first);

      return row?.value ?? 0;
    },
  }),
  followingCount: t.int({
    resolve: async (profile) => {
      const configuredLocalInstance = await resolveConfiguredLocalInstance();

      if (!isConfiguredLocalProfile(profile, configuredLocalInstance)) {
        return 0;
      }

      // TODO: following 수를 Profile DB 컬럼으로 옮기면 이 count 쿼리를 제거한다.
      const row = await db
        .select({ value: count() })
        .from(ProfileFollows)
        .innerJoin(FolloweeProfiles, eq(FolloweeProfiles.id, ProfileFollows.followeeProfileId))
        .where(
          and(
            eq(ProfileFollows.followerProfileId, profile.id),
            eq(FolloweeProfiles.state, ProfileState.ACTIVE),
            or(
              isNull(FolloweeProfiles.instanceId),
              eq(FolloweeProfiles.instanceId, configuredLocalInstance.id),
            ),
          ),
        )
        .then(first);

      return row?.value ?? 0;
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
