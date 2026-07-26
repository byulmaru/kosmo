import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { FollowNotification, getNotificationSource } from '../ref';

builder.objectField(FollowNotification, 'profile', (t) =>
  t.field({
    type: Profile,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSource(notification, ctx)).profileId,
  }),
);
