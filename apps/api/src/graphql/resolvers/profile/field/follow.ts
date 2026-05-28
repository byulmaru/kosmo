import { db, ProfileFollows } from '@kosmo/core/db';
import { ProfileFollowState } from '@kosmo/core/enums';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { asc, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import {
  profileFollowAccessWhere,
  ProfileFollowFolloweeProfiles,
  ProfileFollowFollowerProfiles,
} from '../access/follow';
import {
  acceptedProfileFollowersCountLoader,
  acceptedProfileFollowingCountLoader,
  viewerFollowLoader,
} from '../loader/follow';
import { Profile, ProfileFollow } from '../ref';

type ProfileFollowRow = typeof ProfileFollows.$inferSelect;

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
            .innerJoin(
              ProfileFollowFollowerProfiles,
              eq(ProfileFollowFollowerProfiles.id, ProfileFollows.followerProfileId),
            )
            .innerJoin(
              ProfileFollowFolloweeProfiles,
              eq(ProfileFollowFolloweeProfiles.id, ProfileFollows.followeeProfileId),
            )
            .where(
              profileFollowAccessWhere(ctx, [
                eq(ProfileFollows.followeeProfileId, profile.id),
                eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
                before ? gt(ProfileFollows.id, before) : undefined,
                after ? lt(ProfileFollows.id, after) : undefined,
              ]),
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
            .innerJoin(
              ProfileFollowFollowerProfiles,
              eq(ProfileFollowFollowerProfiles.id, ProfileFollows.followerProfileId),
            )
            .innerJoin(
              ProfileFollowFolloweeProfiles,
              eq(ProfileFollowFolloweeProfiles.id, ProfileFollows.followeeProfileId),
            )
            .where(
              profileFollowAccessWhere(ctx, [
                eq(ProfileFollows.followerProfileId, profile.id),
                eq(ProfileFollows.state, ProfileFollowState.ACCEPTED),
                before ? gt(ProfileFollows.id, before) : undefined,
                after ? lt(ProfileFollows.id, after) : undefined,
              ]),
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
