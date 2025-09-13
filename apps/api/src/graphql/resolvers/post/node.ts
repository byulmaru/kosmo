import { PostState, PostVisibility } from '@kosmo/enum';
import { builder } from '@/graphql/builder';
import { Post, Profile } from '@/graphql/objects';
import { mapErrorToNull } from '@/utils/array';
import { getPostLoader } from './loader';

builder.node(Post, {
  id: { resolve: (post) => post.id },
  loadManyWithoutCache: async (ids, ctx) =>
    getPostLoader(ctx)
      .loadMany(ids)
      .then((posts) => mapErrorToNull(posts)),

  fields: (t) => ({
    content: t.exposeString('content'),
    state: t.expose('state', { type: PostState }),
    visibility: t.expose('visibility', { type: PostVisibility }),
    createdAt: t.expose('createdAt', { type: 'Timestamp' }),
    updatedAt: t.expose('updatedAt', { type: 'Timestamp', nullable: true }),

    author: t.expose('profileId', { type: Profile }),
    replyToPost: t.field({
      type: Post,
      nullable: true,
      resolve: async (post, _, ctx) =>
        post.replyToPostId ? getPostLoader(ctx).load(post.replyToPostId) : null,
    }),

    repostOfPost: t.field({
      type: Post,
      nullable: true,
      resolve: async (post, _, ctx) =>
        post.repostOfPostId ? getPostLoader(ctx).load(post.repostOfPostId) : null,
    }),
  }),
});
