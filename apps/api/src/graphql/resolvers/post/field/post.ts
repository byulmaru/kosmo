import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { Post, PostContent } from '../ref';

builder.objectFields(Post, (t) => ({
  profile: t.expose('profileId', { type: Profile }),
  content: t.field({
    type: PostContent,
    nullable: true,
    resolve: (post) => post.currentContentId,
  }),
}));
