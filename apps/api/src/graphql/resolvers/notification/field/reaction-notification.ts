import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Profile } from '@/graphql/resolvers/profile';
import { getNotificationSourceMetadata, ReactionNotification } from '../ref';

builder.objectFields(ReactionNotification, (t) => ({
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
