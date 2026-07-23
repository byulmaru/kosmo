import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Profile } from '@/graphql/resolvers/profile';
import { getNotificationSource, ReactionNotification } from '../ref';

builder.objectFields(ReactionNotification, (t) => ({
  post: t.field({
    type: Post,
    resolve: async (notification) => (await getNotificationSource(notification)).post!,
  }),
  profile: t.field({
    type: Profile,
    resolve: async (notification) => (await getNotificationSource(notification)).profileId,
  }),
}));
