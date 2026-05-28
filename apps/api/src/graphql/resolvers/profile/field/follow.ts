import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { builder } from '@/graphql/builder';
import {
  acceptedProfileFollowCountLoader,
  acceptedProfileFollowPageLoader,
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
          totalCount:
            (
              await acceptedProfileFollowCountLoader(ctx).load({
                direction: 'followers',
                profileId: profile.id,
              })
            )?.value ?? 0,
        },
        ({ limit, offset }) =>
          acceptedProfileFollowPageLoader(ctx).load({
            direction: 'followers',
            profileId: profile.id,
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
          totalCount:
            (
              await acceptedProfileFollowCountLoader(ctx).load({
                direction: 'following',
                profileId: profile.id,
              })
            )?.value ?? 0,
        },
        ({ limit, offset }) =>
          acceptedProfileFollowPageLoader(ctx).load({
            direction: 'following',
            profileId: profile.id,
            limit,
            offset,
          }),
      );
    },
  }),
  followersCount: t.int({
    resolve: (profile, _, ctx) =>
      acceptedProfileFollowCountLoader(ctx)
        .load({
          direction: 'followers',
          profileId: profile.id,
        })
        .then((row) => row?.value ?? 0),
  }),
  followingCount: t.int({
    resolve: (profile, _, ctx) =>
      acceptedProfileFollowCountLoader(ctx)
        .load({
          direction: 'following',
          profileId: profile.id,
        })
        .then((row) => row?.value ?? 0),
  }),
  viewerFollow: t.field({
    type: ProfileFollow,
    nullable: true,
    resolve: (profile, _, ctx) => viewerFollowLoader(ctx).load(profile.id),
  }),
}));
