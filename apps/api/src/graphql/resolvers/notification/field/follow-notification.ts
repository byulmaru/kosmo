import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { FollowNotification, getNotificationSourceMetadata } from '../ref';

builder.objectField(FollowNotification, 'profile', (t) =>
  t.field({
    type: Profile,
    nullable: true,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSourceMetadata(notification, ctx))?.profileId ?? null,
  }),
);
