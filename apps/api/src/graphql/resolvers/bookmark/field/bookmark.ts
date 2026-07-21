import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Profile } from '@/graphql/resolvers/profile';
import { Bookmark } from '../ref';

builder.objectFields(Bookmark, (t) => ({
  profile: t.field({
    type: Profile,
    resolve: (bookmark) => bookmark.profileId,
  }),
  post: t.field({
    nullable: true,
    type: Post,
    resolve: (bookmark) => bookmark.postId,
  }),
}));
