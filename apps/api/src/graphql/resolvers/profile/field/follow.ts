import { db, ProfileFollows, Profiles } from '@kosmo/core/db';
import { ProfileFollowPolicy, ProfileFollowState, ProfileState } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { builder } from '@/graphql/builder';
import {
  acceptedProfileFollowersCountLoader,
  acceptedProfileFollowingCountLoader,
  viewerFollowLoader,
} from '../loader/follow';
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
          const publicAcceptedWhere = and(
            eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
            eq(FollowerProfiles.followPolicy, ProfileFollowPolicy.OPEN),
            eq(FolloweeProfiles.followPolicy, ProfileFollowPolicy.OPEN),
          )!;
          const visibleWhere = ctx.session?.profileId
            ? or(
                eq(ProfileFollows.followerProfileId, ctx.session.profileId),
                eq(ProfileFollows.followeeProfileId, ctx.session.profileId),
                publicAcceptedWhere,
              )
            : publicAcceptedWhere;

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
                eq(FollowerProfiles.state, ProfileState.ACTIVE),
                eq(FolloweeProfiles.state, ProfileState.ACTIVE),
                visibleWhere,
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
          const publicAcceptedWhere = and(
            eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
            eq(FollowerProfiles.followPolicy, ProfileFollowPolicy.OPEN),
            eq(FolloweeProfiles.followPolicy, ProfileFollowPolicy.OPEN),
          )!;
          const visibleWhere = ctx.session?.profileId
            ? or(
                eq(ProfileFollows.followerProfileId, ctx.session.profileId),
                eq(ProfileFollows.followeeProfileId, ctx.session.profileId),
                publicAcceptedWhere,
              )
            : publicAcceptedWhere;

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
                eq(FollowerProfiles.state, ProfileState.ACTIVE),
                eq(FolloweeProfiles.state, ProfileState.ACTIVE),
                visibleWhere,
              ),
            )
            .orderBy(inverted ? asc(ProfileFollows.id) : desc(ProfileFollows.id))
            .limit(limit);
        },
      );
    },
  }),
  followersCount: t.int({
    resolve: (profile, _, ctx) =>
      acceptedProfileFollowersCountLoader(ctx)
        .load(profile.id)
        .then((row) => row?.value ?? 0),
  }),
  followingCount: t.int({
    resolve: (profile, _, ctx) =>
      acceptedProfileFollowingCountLoader(ctx)
        .load(profile.id)
        .then((row) => row?.value ?? 0),
  }),
  viewerFollow: t.field({
    type: ProfileFollow,
    nullable: true,
    resolve: (profile, _, ctx) => viewerFollowLoader(ctx).load(profile.id),
  }),
}));
