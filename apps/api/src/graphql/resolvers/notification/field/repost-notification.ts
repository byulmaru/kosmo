import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post/ref';
import { Profile } from '@/graphql/resolvers/profile/ref';
import { getNotificationSourceMetadata, RepostNotification } from '../ref';

builder.objectFields(RepostNotification, (t) => ({
  post: t.field({
    type: Post,
    nullable: true,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSourceMetadata(notification, ctx))?.postId ?? null,
  }),
  profile: t.field({
    type: Profile,
    nullable: true,
    resolve: async (notification, _, ctx) =>
      (await getNotificationSourceMetadata(notification, ctx))?.profileId ?? null,
  }),
}));
