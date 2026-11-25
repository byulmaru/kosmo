import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post/ref';
import { Profile } from '@/graphql/resolvers/profile/ref';
import { getNotificationSourceMetadata, MentionNotification } from '../ref';

builder.objectFields(MentionNotification, (t) => ({
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
