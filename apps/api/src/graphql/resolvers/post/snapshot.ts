import { builder } from '@/graphql/builder';
import { File, PostSnapshot } from '@/graphql/objects';
import { mapErrorToNull } from '@/utils/array';
import { getPostSnapshotLoader } from './loader';

builder.node(PostSnapshot, {
  id: { resolve: (postSnapshot) => postSnapshot.id },
  loadManyWithoutCache: async (ids, ctx) =>
    getPostSnapshotLoader(ctx)
      .loadMany(ids)
      .then((postSnapshots) => mapErrorToNull(postSnapshots)),

  fields: (t) => ({
    content: t.expose('content', {
      type: 'JSON',
      nullable: true,
      authScopes: (snapshot) => ({ postView: snapshot.postId }),
      unauthorizedResolver: () => null,
    }),
    media: t.field({
      type: [File],
      nullable: true,
      resolve: async (postSnapshot) => postSnapshot.mediaIds,
      authScopes: (snapshot) => ({ postView: snapshot.postId }),
      unauthorizedResolver: () => null,
    }),
  }),
});
