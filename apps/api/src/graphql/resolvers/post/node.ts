import { PostState, PostVisibility } from '@kosmo/enum';
import { builder } from '@/graphql/builder';
import { Post, PostSnapshot, Profile } from '@/graphql/objects';
import { mapErrorToNull } from '@/utils/array';
import { getPostLoader, getPostSnapshotLoader } from './loader';

builder.node(Post, {
  id: { resolve: (post) => post.id },
  loadManyWithoutCache: async (ids, ctx) =>
    getPostLoader(ctx)
      .loadMany(ids)
      .then((posts) => mapErrorToNull(posts)),

  fields: (t) => ({
    state: t.expose('state', { type: PostState }),
    visibility: t.expose('visibility', { type: PostVisibility }),
    createdAt: t.expose('createdAt', { type: 'Timestamp' }),
    updatedAt: t.expose('updatedAt', { type: 'Timestamp', nullable: true }),

    content: t.field({
      type: 'JSON',
      resolve: async (post, _, ctx) => {
        const postSnapshot = await getPostSnapshotLoader(ctx).load(post.id);
        return postSnapshot?.content;
      },
    }),

    snapshot: t.field({
      type: PostSnapshot,
      nullable: true,
      resolve: async (post, _, ctx) => getPostSnapshotLoader(ctx).load(post.id),
      authScopes: (post) => ({ postView: post.id }),
      unauthorizedResolver: () => null,
    }),

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
