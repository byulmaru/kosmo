import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { repostCountLoader } from '../loader/repost';
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
  replyParent: t.field({
    type: Post,
    nullable: true,
    resolve: (post) => post.replyParentId,
  }),
  repostSource: t.field({
    type: Post,
    nullable: true,
    resolve: (post) => post.repostSourceId,
  }),
  repostCount: t.int({
    resolve: async (post, _, ctx) => (await repostCountLoader(ctx).load(post.id))?.count ?? 0,
  }),
}));
