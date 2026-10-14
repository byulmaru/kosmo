import { builder } from '@/graphql/builder';
import { Profile, ProfileFollowRequest } from '@/graphql/resolvers/profile';
import { FollowRequestNotification, getNotificationSource } from '../ref';

builder.objectField(FollowRequestNotification, 'profile', (t) =>
  t.field({
    type: Profile,
    nullable: true,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSource(notification, ctx))?.profileId ?? null,
  }),
);

builder.objectField(FollowRequestNotification, 'followRequest', (t) =>
  t.field({
    type: ProfileFollowRequest,
    nullable: true,
    resolve: async (notification, _, ctx) => {
      return (await getNotificationSource(notification, ctx))?.followRequest ?? null;
    },
  }),
);
