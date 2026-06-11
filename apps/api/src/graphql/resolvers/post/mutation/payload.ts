import { builder } from '@/graphql/builder';
import { Post } from '../ref';

export const CreatePostPayload = builder.simpleObject('CreatePostPayload', {
  fields: (t) => ({
    post: t.field({ type: Post }),
  }),
});
