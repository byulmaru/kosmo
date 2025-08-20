import { PostState, PostVisibility } from '@kosmo/enum';
import { builder } from '@/graphql/builder';
import { Post, Profile } from '@/graphql/objects';

builder.node(Post, {
  id: { resolve: (post) => post.id },

  loadManyWithoutCache: async (ids, ctx) => {
    return (await Post.getDataloader(ctx).loadMany(ids)).map((post) =>
      post instanceof Error ? null : post,
    );
  },

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
      resolve: async (post) => post.replyToPostId,
    }),

    repostOfPost: t.field({
      type: Post,
      nullable: true,
      resolve: async (post) => post.repostOfPostId,
    }),
  }),
});
