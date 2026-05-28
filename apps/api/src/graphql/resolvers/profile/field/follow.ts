import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { builder } from '@/graphql/builder';
import {
  acceptedProfileFollowersCountLoader,
  acceptedProfileFollowingCountLoader,
  selectAcceptedProfileFollowers,
  selectAcceptedProfileFollowing,
  viewerFollowLoader,
} from '../loader/follow';
import { Profile, ProfileFollow } from '../ref';

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
      return resolveOffsetConnection(
        {
          args,
          totalCount: (await acceptedProfileFollowersCountLoader(ctx).load(profile.id))?.value ?? 0,
        },
        ({ limit, offset }) =>
          selectAcceptedProfileFollowers(ctx, profile.id, {
            limit,
            offset,
          }),
      );
    },
  }),
  following: t.connection({
    type: ProfileFollow,
    resolve: async (profile, args, ctx) => {
      return resolveOffsetConnection(
        {
          args,
          totalCount: (await acceptedProfileFollowingCountLoader(ctx).load(profile.id))?.value ?? 0,
        },
        ({ limit, offset }) =>
          selectAcceptedProfileFollowing(ctx, profile.id, {
            limit,
            offset,
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
