import { PostQuoteConsentStatus } from '@kosmo/core/enums';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/resolvers/profile';
import {
  cachedHomePostContentLoader,
  cachedHomeRepostSourceLoader,
} from '../loader/cached-home-post';
import { postProfilePinLoader } from '../loader/profile-pin';
import { reactionCountLoader } from '../loader/reaction-count';
import { replyCountLoader } from '../loader/reply-count';
import { repostCountLoader, viewerRepostLoader } from '../loader/repost';
import { isCachedHomeTimelinePost, Post, PostContent } from '../ref';

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
    resolve: (post, _, ctx) => {
      if (!isCachedHomeTimelinePost(post)) {
        return post.currentContentId;
      }
      if (post.currentContentId == null) {
        return null;
      }

      return cachedHomePostContentLoader(ctx).load(post.currentContentId);
    },
  }),
  replyParent: t.field({
    type: Post,
    nullable: true,
    resolve: (post) => post.replyParentId,
  }),
  repostSource: t.field({
    type: Post,
    nullable: true,
    resolve: (post, _, ctx) => {
      if (
        post.currentContentId != null &&
        post.quoteConsentStatus != null &&
        post.quoteConsentStatus !== PostQuoteConsentStatus.APPROVED
      ) {
        return null;
      }
      if (
        !isCachedHomeTimelinePost(post) ||
        post.currentContentId != null ||
        post.repostSourceId == null
      ) {
        return post.repostSourceId;
      }

      return cachedHomeRepostSourceLoader(ctx).load(post.repostSourceId);
    },
  }),
  repostCount: t.int({
    resolve: async (post, _, ctx) => (await repostCountLoader(ctx).load(post.id))?.count ?? 0,
  }),
  replyCount: t.int({
    nullable: true,
    resolve: async (post, _, ctx) => (await replyCountLoader(ctx).load(post.id))?.count ?? 0,
  }),
  reactionCounts: t.field({
    type: [ReactionCount],
    resolve: (post, _, ctx) => reactionCountLoader(ctx).load(post.id),
  }),
  isPinned: t.boolean({
    nullable: true,
    resolve: async (post, _, ctx) => (await postProfilePinLoader(ctx).load(post.id)) !== null,
  }),
  viewerRepost: t.field({
    type: Post,
    nullable: true,
    resolve: (post, _, ctx) => viewerRepostLoader(ctx).load(post.id),
  }),
}));
