import { builder } from '@/graphql/builder';
import { Profile, ProfileFollowRequest } from '@/graphql/resolvers/profile';
import { FollowRequestNotification, getNotificationSourceMetadata } from '../ref';

builder.objectField(FollowRequestNotification, 'profile', (t) =>
  t.field({
    type: Profile,
    nullable: true,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSourceMetadata(notification, ctx))?.profileId ?? null,
  }),
);

builder.objectField(FollowRequestNotification, 'followRequest', (t) =>
  t.field({
    type: ProfileFollowRequest,
    nullable: true,
    resolve: (notification) => notification.sourceId,
  }),
);
