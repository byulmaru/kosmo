import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Profile } from '@/graphql/resolvers/profile';
import { getNotificationSource, ReplyNotification } from '../ref';

builder.objectFields(ReplyNotification, (t) => ({
  post: t.field({
    type: Post,
    resolve: async (notification, _, ctx) => (await getNotificationSource(notification, ctx)).post!,
  }),
  profile: t.field({
    type: Profile,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSource(notification, ctx)).profileId,
  }),
}));
