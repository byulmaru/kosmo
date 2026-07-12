import { db, ProfileFollowRequests, ProfileFollows, Profiles } from '@kosmo/core/db';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { builder } from '@/graphql/builder';
import { profileFollowAccessWhere } from '../access/follow';
import { viewerFollowLoader } from '../loader/follow';
import { viewerFollowRequestLoader } from '../loader/follow-request';
import {
  Profile,
  ProfileFollow,
  ProfileFollowRequest,
  ProfileFollowRequestConnection,
} from '../ref';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;
type ProfileFollowRequestRow = typeof ProfileFollowRequests.$inferSelect;

const FollowerProfiles = alias(Profiles, 'profile_follow_connection_follower_profile');
const FolloweeProfiles = alias(Profiles, 'profile_follow_connection_followee_profile');
const ProfileViewerState = builder.simpleObject('ProfileViewerState', {
  fields: (field) => ({
    isSelf: field.boolean(),
    follow: field.field({ type: ProfileFollow, nullable: true }),
    followRequest: field.field({ type: ProfileFollowRequest, nullable: true }),
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

builder.objectFields(ProfileFollowRequest, (t) => ({
  follower: t.field({
    type: Profile,
    nullable: true,
    resolve: (request) => request.followerProfileId,
  }),
  followee: t.field({
    type: Profile,
    nullable: true,
    resolve: (request) => request.followeeProfileId,
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
  followersCount: t.exposeInt('followersCount'),
  followingCount: t.exposeInt('followingCount'),
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
        followRequest: await viewerFollowRequestLoader(ctx).load(profile.id),
      };
    },
  }),
}));

builder.queryField('incomingFollowRequests', (t) =>
  t.withAuth({ usingProfile: true }).connection(
    {
      type: ProfileFollowRequest,
      nullable: true,
      unauthorizedResolver: () => null,
      resolve: (_, args, ctx) =>
        resolveCursorConnection<Promise<ProfileFollowRequestRow[]>>(
          { args, toCursor: (request) => request.id },
          ({ before, after, limit, inverted }) =>
            db
              .select()
              .from(ProfileFollowRequests)
              .where(
                and(
                  eq(ProfileFollowRequests.followeeProfileId, ctx.session.profileId),
                  before ? gt(ProfileFollowRequests.id, before) : undefined,
                  after ? lt(ProfileFollowRequests.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(ProfileFollowRequests.id) : desc(ProfileFollowRequests.id))
              .limit(limit),
        ),
    },
    ProfileFollowRequestConnection as never,
  ),
);

builder.queryField('outgoingFollowRequests', (t) =>
  t.withAuth({ usingProfile: true }).connection(
    {
      type: ProfileFollowRequest,
      nullable: true,
      unauthorizedResolver: () => null,
      resolve: (_, args, ctx) =>
        resolveCursorConnection<Promise<ProfileFollowRequestRow[]>>(
          { args, toCursor: (request) => request.id },
          ({ before, after, limit, inverted }) =>
            db
              .select()
              .from(ProfileFollowRequests)
              .where(
                and(
                  eq(ProfileFollowRequests.followerProfileId, ctx.session.profileId),
                  before ? gt(ProfileFollowRequests.id, before) : undefined,
                  after ? lt(ProfileFollowRequests.id, after) : undefined,
                ),
              )
              .orderBy(inverted ? asc(ProfileFollowRequests.id) : desc(ProfileFollowRequests.id))
              .limit(limit),
        ),
    },
    ProfileFollowRequestConnection as never,
  ),
);
