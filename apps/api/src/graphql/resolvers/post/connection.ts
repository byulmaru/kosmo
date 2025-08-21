import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/objects';

export const PostConnection = builder.connectionObject({
  type: Post,
  name: 'PostConnection',
});
