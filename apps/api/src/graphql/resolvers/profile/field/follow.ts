import { resolveCursorConnection } from '@pothos/plugin-relay';
import { builder } from '@/graphql/builder';
import {
  acceptedProfileFollowersCountLoader,
  acceptedProfileFollowingCountLoader,
  selectAcceptedProfileFollowers,
  selectAcceptedProfileFollowing,
  viewerFollowLoader,
} from '../loader/follow';
import { Profile, ProfileFollow } from '../ref';
import type { ProfileFollowRow } from '../loader/follow';

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
        async ({ before, after, limit, inverted }) =>
          await selectAcceptedProfileFollowers(ctx, profile.id, {
            before,
            after,
            limit,
            inverted,
          }),
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
        async ({ before, after, limit, inverted }) =>
          await selectAcceptedProfileFollowing(ctx, profile.id, {
            before,
            after,
            limit,
            inverted,
          }),
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
