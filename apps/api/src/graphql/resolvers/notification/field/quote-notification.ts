import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Profile } from '@/graphql/resolvers/profile';
import { getNotificationSource, QuoteNotification } from '../ref';

builder.objectFields(QuoteNotification, (t) => ({
  post: t.field({
    type: Post,
    nullable: true,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSource(notification, ctx)).post?.id ?? null,
  }),
  profile: t.field({
    type: Profile,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSource(notification, ctx)).profileId,
  }),
}));
