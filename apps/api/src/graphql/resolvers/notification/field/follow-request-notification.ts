import { builder } from '@/graphql/builder';
import { Profile, ProfileFollowRequest } from '@/graphql/resolvers/profile';
import { FollowRequestNotification, getNotificationSource } from '../ref';

builder.objectField(FollowRequestNotification, 'profile', (t) =>
  t.field({
    type: Profile,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSource(notification, ctx)).profileId,
  }),
);

builder.objectField(FollowRequestNotification, 'followRequest', (t) =>
  t.field({
    type: ProfileFollowRequest,
    resolve: async (notification, _, ctx) => {
      const source = await getNotificationSource(notification, ctx);
      if (!source.followRequest) {
        throw new Error('Follow Request Notification source not found');
      }
      return source.followRequest;
    },
  }),
);
