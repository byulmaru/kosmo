import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import { reactionCountLoader } from '../loader/reaction-count';
import { repostCountLoader, viewerRepostLoader } from '../loader/repost';
import { Post, PostContent } from '../ref';

const ReactionCount = builder.simpleObject('ReactionCount', {
  fields: (t) => ({
    type: t.string(),
    count: t.int(),
  }),
});

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
  reactionCounts: t.field({
    type: [ReactionCount],
    resolve: (post, _, ctx) => reactionCountLoader(ctx).load(post.id),
  }),
  viewerRepost: t.field({
    type: Post,
    nullable: true,
    resolve: (post, _, ctx) => viewerRepostLoader(ctx).load(post.id),
  }),
}));
