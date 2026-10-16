import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Profile } from '@/graphql/resolvers/profile';
import { getNotificationSourceMetadata, QuoteNotification } from '../ref';

builder.objectFields(QuoteNotification, (t) => ({
  post: t.field({
    type: Post,
    nullable: true,
    resolve: (notification) => notification.sourceId,
  }),
  profile: t.field({
    type: Profile,
    nullable: true,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSourceMetadata(notification, ctx))?.profileId ?? null,
  }),
}));
