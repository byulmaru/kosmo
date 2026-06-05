import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { Post, PostContent } from '../ref';

builder.objectFields(Post, (t) => ({
  profile: t.field({
    type: Profile,
    resolve: (post) => post.profileId,
  }),
  content: t.field({
    type: PostContent,
    nullable: true,
    resolve: (post) => post.currentContentId,
  }),
}));
