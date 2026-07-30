import { usePathname } from 'expo-router';
import { Profiler, Suspense, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { graphql, RelayEnvironmentProvider, useLazyLoadQuery } from 'react-relay';
import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import { expect, fn, mocked, screen, userEvent, waitFor, within } from 'storybook/test';
import { Temporal } from 'temporal-polyfill';
import { trackAnalytics } from '@/analytics/client';
import PostDetailScreen from '@/app/(tabs)/(post)/[profileHandle]/[postId]';
import { PostBody } from '@/components/post/PostBody';
import { PostComposer } from '@/components/post/PostComposer';
import { PostComposerMediaItems } from '@/components/post/PostComposerMediaControls';
import { PostDetailThread } from '@/components/post/PostDetailThread';
import { PostLayout } from '@/components/post/PostLayout';
import { PostList } from '@/components/post/PostList';
import { PostListItem } from '@/components/post/PostListItem';
import { PostReplyCoordinatorProvider } from '@/components/post/PostReplyCoordinator';
import { PostSourcePresentationView } from '@/components/post/PostSourcePresentationView';
import { PostThreadLayout } from '@/components/post/PostThreadLayout';
import { ReplyComposerSurface } from '@/components/post/ReplyComposerSurface';
import { formatTimelineTimestamp } from '@/lib/date';
import { RelayEnvironmentBoundary } from '@/relay/RelayEnvironmentBoundary';
import { SessionProvider } from '@/session/SessionProvider';
import { colors } from '@/theme/tokens';
import {
  getImagePickerLaunchCount,
  resetImagePickerMock,
  setNextImagePickerResult,
} from '../../.storybook/mocks/expo-image-picker';
import { longBody, post, profile, profileWithPosts, timeline } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';
import type { ComposerMediaItem } from '@/components/post/PostComposerMediaControls';
import type { PostSourcePresentationData } from '@/components/post/PostSourcePresentationView';
import type { PostDetailThreadIdentityStoryQuery } from './__generated__/PostDetailThreadIdentityStoryQuery.graphql';
import type { PostsStoriesQuery as PostsStoriesQueryType } from './__generated__/PostsStoriesQuery.graphql';
import type { StoryPost } from './fixtures';

function getColorContrastRatio(foreground: string, background: string) {
  const relativeLuminance = (color: string) => {
    const hex = /^#([\da-f]{6})$/i.exec(color)?.[1];
    const channels = hex
      ? [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
      : color
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number);
    if (!channels || channels.length !== 3) {
      throw new Error(`RGB color를 해석할 수 없습니다: ${color}`);
    }
    const [red, green, blue] = channels.map((channel) => {
      const normalized = channel! / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };

  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

const shortPost = {
  ...post({
    bodyText: '짧은 본문 한 줄.',
    id: 'short',
    reactionCounts: [{ count: 2, type: '❤️' }],
  }),
  repostCount: 2,
  viewerRepost: { __typename: 'Post' as const, id: 'short-viewer-repost' },
};
const longPost = post({ bodyText: longBody, id: 'long' });
const multilinePost = post({
  bodyText: '첫 번째 문단입니다.\n두 번째 줄입니다.\n\n빈 줄 뒤의 마지막 문단입니다.',
  id: 'multiline',
});
const emptyPost = post({ bodyText: null, id: 'empty' });
const manyLinesPost = post({
  bodyText: Array.from({ length: 14 }, (_, index) => `${index + 1}번째 줄`).join('\n'),
  id: 'many-lines',
});
const nowPost = post({
  bodyText: '지금 작성된 게시글.',
  createdAt: Temporal.Now.instant().toString(),
  id: 'now',
});
const secondsOldPost = post({
  bodyText: '30초 전에 작성된 게시글.',
  createdAt: Temporal.Now.instant().subtract({ seconds: 30 }).toString(),
  id: 'seconds-old',
});
const hoursOldPost = post({
  bodyText: '3시간 전에 작성된 게시글.',
  createdAt: Temporal.Now.instant().subtract({ hours: 3 }).toString(),
  id: 'hours-old',
});
const oldPost = post({
  bodyText: '하루 이상 지난 게시글입니다.',
  createdAt: '2026-04-27T21:14:00.000Z',
  id: 'old',
});
const visibilityPosts = (['PUBLIC', 'UNLISTED', 'FOLLOWERS', 'DIRECT'] as const).map((visibility) =>
  post({
    bodyText: `${visibility} 게시글.`,
    id: `detail-${visibility.toLowerCase()}`,
    visibility,
  }),
);
const remoteAuthorPost = post({
  bodyText: '긴 이름과 핸들에서도 본문 정렬은 유지됩니다.',
  id: 'detail-remote',
  profile: profile({
    displayName: '정말 아주 긴 표시 이름을 가진 게시글 작성자 프로필',
    handle: 'very-long-author-handle-that-should-not-break-layout',
    id: 'profile-detail-remote',
    relativeHandle: '@user@remote.example',
  }),
});
const linkedPost = post({
  bodyDocument: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '일반 텍스트와 ' },
          {
            type: 'text',
            text: '안전한 외부 링크',
            marks: [{ type: 'link', attrs: { href: 'https://example.com/path' } }],
          },
          { type: 'hard_break' },
          { type: 'text', text: '강제 개행을 함께 표시합니다.' },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: '두 번째 문단입니다.' }] },
    ],
  },
  bodyText: '일반 텍스트와 안전한 외부 링크\n강제 개행을 함께 표시합니다.\n\n두 번째 문단입니다.',
  id: 'linked',
});
const unsupportedDocumentPost = post({
  bodyDocument: {
    type: 'doc',
    content: [{ type: 'pre', content: [{ type: 'text', text: '실행하면 안 되는 구조' }] }],
  } as never,
  bodyText: '미지원 문서는 안전한 Plain Text로 표시합니다.',
  id: 'unsupported-document',
});
const mediaTextPost = post({
  bodyDocument: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'document text' }] },
      { type: 'media', attrs: { mediaId: 'media-story' } },
    ],
  },
  bodyText: '이미지가 있는 문서는 안전한 Plain Text로 표시합니다.',
  id: 'media-text',
});
const mediaOnlyPost = post({
  bodyDocument: {
    type: 'doc',
    attrs: { sensitiveMedia: true },
    content: [{ type: 'paragraph' }, { type: 'media', attrs: { mediaId: 'media-only-story' } }],
  },
  bodyText: '',
  id: 'media-only',
});
const sourceAuthor = profile({
  displayName: '아주 긴 Source 작성자 표시 이름',
  handle: 'source@remote.example',
  id: 'profile-repost-source',
  relativeHandle: '@source@remote.example',
});
const repostAuthor = profile({
  displayName: '재게시한 코스모 사용자',
  handle: 'reposter',
  id: 'profile-repost-author',
  relativeHandle: '@reposter',
});
const sourcePost = {
  ...post({
    bodyText: '원문 작성자의 긴 본문과 줄바꿈을 표시합니다.\n두 번째 줄입니다.',
    id: 'post-source',
    profile: sourceAuthor,
    reactionCounts: [{ count: 4, type: '👀' }],
  }),
  repostCount: 7,
  viewerRepost: { __typename: 'Post' as const, id: 'source-viewer-repost' },
};
const deepestSourceAuthor = profile({
  displayName: '두 번째 Source 작성자',
  handle: 'deep-source@remote.example',
  id: 'profile-source-depth-2',
  relativeHandle: '@deep-source@remote.example',
});
const deepestSourcePost = post({
  bodyText: '두 번째 Source의 본문은 목록에서 full preview하지 않습니다.',
  id: 'post-source-depth-2',
  profile: deepestSourceAuthor,
});
const sourceQuotePost = post({
  bodyText: '첫 번째 direct Source Quote의 본문입니다.',
  id: 'post-source-quote',
  profile: sourceAuthor,
  repostSource: deepestSourcePost,
});
const pureRepost = {
  ...post({
    bodyText: null,
    id: 'post-repost',
    profile: repostAuthor,
    reactionCounts: [{ count: 99, type: '🌈' }],
    repostSource: sourcePost,
  }),
  repostCount: 1,
  viewerRepost: null,
};
const longPureRepost = post({
  bodyText: null,
  id: 'post-repost-long-author',
  profile: profile({
    displayName: '모바일 너비에서도 한 줄로 줄어들어야 하는 아주 길고 긴 재게시 작성자 표시 이름',
    handle: 'extremely-long-repost-author-handle-for-mobile-overflow',
    id: 'profile-repost-author-long',
    relativeHandle: '@extremely-long-repost-author-handle-for-mobile-overflow',
  }),
  repostSource: sourcePost,
});
const quotePost = {
  ...post({
    bodyText: '이 원문에 덧붙이는 인용자의 본문입니다.',
    id: 'post-quote',
    profile: repostAuthor,
    reactionCounts: [{ count: 3, type: '🎉' }],
    repostSource: sourcePost,
  }),
  repostCount: 3,
  viewerRepost: null,
};
const pureRepostOfQuote = post({
  bodyText: null,
  id: 'post-repost-of-quote',
  profile: repostAuthor,
  repostSource: sourceQuotePost,
});
const quoteOfQuotePost = post({
  bodyText: 'Source Quote를 인용하는 outer Quote 본문입니다.',
  id: 'post-quote-of-quote',
  profile: repostAuthor,
  repostSource: sourceQuotePost,
});
const replyQuotePost = post({
  bodyText: '답글 관계를 유지하는 인용입니다.',
  id: 'post-reply-quote',
  profile: repostAuthor,
  replyParent: { __typename: 'Post', id: 'post-reply-parent' },
  repostSource: sourcePost,
});
const quoteWithoutSource = post({
  bodyText: '원문을 더 이상 볼 수 없어도 남는 인용 본문입니다.',
  id: 'post-quote-source-null',
  profile: repostAuthor,
});
const invalidContentlessReplySource = post({
  bodyText: null,
  id: 'post-invalid-contentless-reply-source',
  profile: repostAuthor,
  replyParent: { __typename: 'Post', id: 'post-reply-parent' },
  repostSource: sourcePost,
});
const longSourcePost = post({
  bodyText: `${longBody}\n${longBody}`,
  id: 'post-source-long',
  profile: profile({
    displayName: '모바일 너비를 확인하기 위한 매우 길고 줄어들 수 있는 Source 작성자 표시 이름',
    handle: 'extremely-long-source-handle-for-mobile-overflow@remote.example',
    id: 'profile-source-long',
    relativeHandle: '@extremely-long-source-handle-for-mobile-overflow@remote.example',
  }),
});
const longQuotePost = post({
  bodyText: `${longBody}\n${longBody}`,
  id: 'post-quote-long',
  profile: repostAuthor,
  repostSource: longSourcePost,
});
const linkedSourceQuote = {
  ...linkedPost,
  id: 'post-quote-linked-source',
  profile: repostAuthor,
  repostSource: linkedPost,
};
const threadRootPost = post({ bodyText: '대화의 시작입니다.', id: 'thread-root' });
const threadParentPost = post({ bodyText: '직접 Parent Reply입니다.', id: 'thread-parent' });
const threadCurrentPost = post({ bodyText: '지금 보고 있는 Reply입니다.', id: 'thread-current' });
const threadChildPost = post({ bodyText: '현재 Reply에 이어진 답글입니다.', id: 'thread-child' });
const threadSiblingPost = post({ bodyText: '별도 분기의 답글입니다.', id: 'thread-sibling' });
const threadQuoteSourcePost = post({
  bodyText: '인용된 Source 본문입니다.',
  id: 'thread-quote-source',
});
const threadReplyQuotePost = {
  ...post({
    bodyText: 'Reply이면서 Quote인 Post의 자체 Content입니다.',
    id: 'thread-reply-quote',
  }),
  repostSource: threadQuoteSourcePost,
};
const routeRootPost = {
  ...post({ bodyText: 'Route Root 본문', id: 'route-root' }),
  viewerReactions: [],
};
const routeParentPost = {
  ...post({
    bodyText: 'Route Parent 본문',
    id: 'route-parent',
    replyParent: { __typename: 'Post', id: routeRootPost.id },
  }),
  viewerReactions: [],
};
const routeSourcePost = {
  ...post({ bodyText: 'Source 본문', id: 'route-source' }),
  viewerReactions: [],
};
const routeCurrentPost = {
  ...post({
    bodyText: '현재 Reply 본문',
    id: 'route-current',
    replyParent: { __typename: 'Post', id: routeParentPost.id },
  }),
  viewerReactions: [],
};
const routeCurrentPostReactionCounts = [{ count: 2, type: '❤️' }];
const postLayoutReactionPost = {
  ...post({
    bodyText: 'PostLayout이 반응 요약을 직접 소유하는 게시글입니다.',
    id: 'post-layout-reaction',
    reactionCounts: routeCurrentPostReactionCounts,
  }),
  viewerReactions: [],
};
const routeCurrentPostWithoutReactions = { ...routeCurrentPost, reactionCounts: [] };
const routeChildPost = {
  ...post({
    bodyText: 'Child 본문',
    id: 'route-child',
    replyParent: { __typename: 'Post', id: routeCurrentPost.id },
  }),
  viewerReactions: [],
};
const routeCreatedReply = {
  ...post({
    bodyText: 'targeted refetch로 반영된 새 Reply',
    id: 'route-created-reply',
    replyParent: { __typename: 'Post', id: routeCurrentPost.id },
  }),
  viewerReactions: [],
};
const routeSiblingPost = {
  ...post({
    bodyText: 'Sibling 본문',
    id: 'route-sibling',
    replyParent: { __typename: 'Post', id: routeParentPost.id },
  }),
  viewerReactions: [],
};
const routeReplyQuotePost = {
  ...post({
    bodyText: 'Reply+Quote 자체 Content',
    id: 'route-reply-quote',
    replyParent: { __typename: 'Post', id: routeSiblingPost.id },
    repostSource: routeSourcePost,
  }),
  viewerReactions: [],
};
const routeSourceNullPost = {
  ...post({
    bodyText: 'Source가 없어도 남는 Content',
    id: 'route-source-null',
    replyParent: { __typename: 'Post', id: routeSiblingPost.id },
  }),
  viewerReactions: [],
};
const routeHiddenAncestorPost = {
  ...post({
    bodyText: '숨겨진 답글',
    id: 'route-hidden-ancestor',
  }),
  viewerReactions: [],
};
const routeVisibleParentPost = {
  ...post({
    bodyText: '조회 가능한 직접 Parent',
    id: 'route-visible-parent',
    replyParent: { __typename: 'Post', id: routeHiddenAncestorPost.id },
  }),
  viewerReactions: [],
};
const routeBoundaryCurrentPost = {
  ...post({
    bodyText: '경계 Current 본문',
    id: 'route-boundary-current',
    replyParent: { __typename: 'Post', id: routeVisibleParentPost.id },
  }),
  viewerReactions: [],
};
const routeBoundaryCurrentPostWithoutReactions = {
  ...routeBoundaryCurrentPost,
  reactionCounts: [],
};
const paginationInitialReplies = Array.from({ length: 20 }, (_, index) => ({
  ...post({
    bodyText: `기존 Reply ${index + 1}\n${Array.from({ length: 8 }, () => '긴 document scroll 검증 본문').join('\n')}`,
    id: `pagination-initial-${index + 1}`,
    replyParent: { __typename: 'Post', id: routeCurrentPost.id },
  }),
  viewerReactions: [],
}));
const paginationInitialReply = {
  ...post({
    bodyText: '짧은 화면의 초기 Reply',
    id: 'pagination-short-initial',
    replyParent: { __typename: 'Post', id: routeCurrentPost.id },
  }),
  viewerReactions: [],
};
const paginationFirstNextReply = {
  ...post({
    bodyText: '첫 다음 page Reply',
    id: 'pagination-next-first',
    replyParent: { __typename: 'Post', id: routeCurrentPost.id },
  }),
  viewerReactions: [],
};
const paginationDuplicateNextReply = {
  ...post({
    bodyText: '중복 요청이면 나타나는 Reply',
    id: 'pagination-next-duplicate',
    replyParent: { __typename: 'Post', id: routeCurrentPost.id },
  }),
  viewerReactions: [],
};
const paginationRetryReply = {
  ...post({
    bodyText: '재시도로 추가된 Reply',
    id: 'pagination-next-retry',
    replyParent: { __typename: 'Post', id: routeCurrentPost.id },
  }),
  viewerReactions: [],
};
const threadItems = {
  ancestors: [
    { connectedToPrevious: false, id: threadRootPost.id },
    { connectedToPrevious: true, id: threadParentPost.id },
  ],
  current: { connectedToPrevious: true, id: threadCurrentPost.id },
  descendants: [
    { connectedToPrevious: true, id: threadChildPost.id },
    { connectedToPrevious: false, id: threadSiblingPost.id },
    { connectedToPrevious: true, id: threadReplyQuotePost.id },
  ],
} as const;
const threadStoryPosts = [
  threadRootPost,
  threadParentPost,
  threadCurrentPost,
  threadChildPost,
  threadSiblingPost,
  threadReplyQuotePost,
  threadQuoteSourcePost,
];
const storyPosts = [
  shortPost,
  longPost,
  multilinePost,
  emptyPost,
  manyLinesPost,
  nowPost,
  secondsOldPost,
  hoursOldPost,
  oldPost,
  ...visibilityPosts,
  remoteAuthorPost,
  linkedPost,
  unsupportedDocumentPost,
  ...threadStoryPosts,
  sourcePost,
  pureRepost,
  longPureRepost,
  quotePost,
  replyQuotePost,
  quoteWithoutSource,
  invalidContentlessReplySource,
  longSourcePost,
  longQuotePost,
  linkedSourceQuote,
  routeRootPost,
  routeParentPost,
  routeCurrentPost,
  routeChildPost,
  routeSiblingPost,
  routeReplyQuotePost,
  routeSourcePost,
  routeSourceNullPost,
  routeHiddenAncestorPost,
  routeVisibleParentPost,
  routeBoundaryCurrentPost,
  postLayoutReactionPost,
  deepestSourcePost,
  sourceQuotePost,
  pureRepostOfQuote,
  quoteOfQuotePost,
  mediaTextPost,
  mediaOnlyPost,
];
const composerProfile = profile({ id: 'profile-composer' });
const alternateComposerProfile = profile({ id: 'profile-composer-alternate' });
const emptyPostsProfile = profileWithPosts([], { id: 'profile-posts-empty' });
const contentPostsProfile = profileWithPosts(
  [shortPost, pureRepostOfQuote, quotePost, quoteWithoutSource].map(withReactionViewerState),
  { id: 'profile-posts-content' },
);
const homeTimeline = timeline(
  ...[shortPost, pureRepost, quotePost, replyQuotePost, quoteOfQuotePost, linkedSourceQuote].map(
    withReactionViewerState,
  ),
);

const PostsStoriesQuery = graphql`
  query PostsStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Post {
        id
        repostSource {
          id
        }
        ...PostBody_post @alias(as: "body")
        ...PostLayout_post @alias(as: "layout")
        ...PostListItem_post @alias(as: "listItem")
        ...ReplyComposerSurface_parent @alias(as: "replySurface")
      }
    }
    composerProfile: node(id: "profile-composer") {
      __typename
      ... on Profile {
        id
        ...PostComposer_profile @alias(as: "composer")
        ...ReplyComposerSurface_profile @alias(as: "replySurface")
      }
    }
    alternateComposerProfile: node(id: "profile-composer-alternate") {
      __typename
      ... on Profile {
        id
        ...PostComposer_profile @alias(as: "composer")
        ...ReplyComposerSurface_profile @alias(as: "replySurface")
      }
    }
    emptyPostsProfile: node(id: "profile-posts-empty") {
      __typename
      ... on Profile {
        id
        ...PostList_profile @alias(as: "postList")
      }
    }
    contentPostsProfile: node(id: "profile-posts-content") {
      __typename
      ... on Profile {
        id
        ...PostList_profile @alias(as: "postList")
      }
    }
    homeTimeline(first: 20) {
      ...PostList_homeTimeline
    }
  }
`;

const PostDetailThreadIdentityStoryQuery = graphql`
  query PostDetailThreadIdentityStoryQuery($postId: ID!) {
    node(id: $postId) {
      __typename
      ... on Post {
        id
        ...PostDetailThread_post @arguments(count: 20) @alias(as: "thread")
      }
    }
  }
`;

type PostNode = Extract<
  NonNullable<PostsStoriesQueryType['response']['nodes'][number]>,
  { readonly __typename: 'Post' }
>;

type PostsStoryArgs = {
  onRetry?: ReturnType<typeof fn>;
};

function usePostsStoryData() {
  const data = useLazyLoadQuery<PostsStoriesQueryType>(PostsStoriesQuery, {
    ids: storyPosts.map(({ id }) => id),
  });
  const posts = data.nodes.map((node) => {
    if (node?.__typename !== 'Post') {
      throw new Error('PostsStoriesQuery must return Post nodes in fixture order.');
    }
    return node;
  });
  if (
    data.alternateComposerProfile?.__typename !== 'Profile' ||
    data.composerProfile?.__typename !== 'Profile' ||
    data.contentPostsProfile?.__typename !== 'Profile' ||
    data.emptyPostsProfile?.__typename !== 'Profile' ||
    !data.homeTimeline
  ) {
    throw new Error('PostsStoriesQuery must return a home timeline fixture.');
  }

  return {
    alternateComposerProfile: requireFragment(
      data.alternateComposerProfile.composer,
      'alternate composer profile',
    ),
    composerProfile: requireFragment(data.composerProfile.composer, 'composer profile'),
    replyComposerProfile: requireFragment(
      data.composerProfile.replySurface,
      'Reply Composer profile',
    ),
    contentPostsProfile: requireFragment(data.contentPostsProfile.postList, 'content post list'),
    emptyPostsProfile: requireFragment(data.emptyPostsProfile.postList, 'empty post list'),
    homeTimeline: data.homeTimeline,
    posts,
  };
}

function requireFragment<T>(fragment: T | null | undefined, label: string): T {
  if (!fragment) {
    throw new Error(`Missing ${label} fragment reference.`);
  }
  return fragment;
}

function requirePost(posts: ReadonlyArray<PostNode>, index: number): PostNode {
  const result = posts[index];
  if (!result) {
    throw new Error(`Missing post fixture at index ${index}.`);
  }
  return result;
}

function requireStoryPostById(posts: ReadonlyArray<StoryPost>, id: string): StoryPost {
  const result = posts.find((post) => post.id === id);
  if (!result) {
    throw new Error(`Missing post fixture with id ${id}.`);
  }
  return result;
}

function requirePostById(posts: ReadonlyArray<PostNode>, id: string): PostNode {
  const result = posts.find((postNode) => postNode.id === id);
  if (!result) {
    throw new Error(`Missing post fixture ${id}.`);
  }
  return result;
}

function toPostSourcePresentationData(post: StoryPost): PostSourcePresentationData {
  const repostSource = post.repostSource ?? null;

  return {
    content: post.content ?? null,
    createdAt: post.createdAt,
    id: post.id,
    profile: post.profile,
    replyParent: post.replyParent ?? null,
    repostSource: repostSource
      ? {
          content: repostSource.content ?? null,
          createdAt: repostSource.createdAt,
          id: repostSource.id,
          profile: repostSource.profile,
        }
      : null,
  };
}

function PostCatalog(_args: PostsStoryArgs) {
  void _args;
  const { posts } = usePostsStoryData();

  return (
    <Catalog>
      <Section title="Body · list md / detail lg / empty">
        <PostBody post={requireFragment(requirePost(posts, 2).body, 'multiline post body')} />
        <PostBody
          post={requireFragment(requirePost(posts, 2).body, 'large multiline post body')}
          size="lg"
        />
        <PostBody post={requireFragment(requirePost(posts, 3).body, 'empty post body')} />
        <PostBody post={requireFragment(requirePost(posts, 14).body, 'linked post body')} />
        <PostBody
          post={requireFragment(requirePost(posts, 15).body, 'unsupported document post body')}
        />
        <View testID="media-text">
          <PostBody
            post={requireFragment(
              requirePostById(posts, mediaTextPost.id).body,
              'text and media post body',
            )}
          />
        </View>
        <View testID="media-only">
          <PostBody
            post={requireFragment(
              requirePostById(posts, mediaOnlyPost.id).body,
              'media-only post body',
            )}
          />
        </View>
      </Section>

      <Section title="List items · body states">
        <PostListItem post={requireFragment(requirePost(posts, 0).listItem, 'short post item')} />
        <PostListItem post={requireFragment(requirePost(posts, 1).listItem, 'long post item')} />
        <PostListItem
          post={requireFragment(requirePost(posts, 4).listItem, 'many-lines post item')}
        />
        <PostListItem post={requireFragment(requirePost(posts, 3).listItem, 'empty post item')} />
      </Section>

      <Section title="List items · time states">
        <PostListItem post={requireFragment(requirePost(posts, 5).listItem, 'new post item')} />
        <PostListItem
          post={requireFragment(requirePost(posts, 6).listItem, 'seconds-old post item')}
        />
        <PostListItem
          post={requireFragment(requirePost(posts, 7).listItem, 'hours-old post item')}
        />
        <PostListItem post={requireFragment(requirePost(posts, 8).listItem, 'old post item')} />
        <PostListItem
          post={requireFragment(requirePost(posts, 13).listItem, 'remote author post item')}
        />
      </Section>

      <Section title="Detail layout · visibility and long author">
        {visibilityPosts.map((visibilityPost, index) => (
          <PostLayout
            key={visibilityPost.id}
            post={requireFragment(requirePost(posts, index + 9).layout, 'visibility post layout')}
          />
        ))}
        <PostLayout
          post={requireFragment(requirePost(posts, 13).layout, 'remote author post layout')}
        />
        <View testID="detail-quote-layout">
          <PostLayout
            post={requireFragment(
              requirePostById(posts, quotePost.id).layout,
              'quote post detail layout',
            )}
          />
        </View>
        <View testID="detail-default-action-layout">
          <PostLayout
            post={requireFragment(requirePost(posts, 2).layout, 'default action detail layout')}
          />
        </View>
        <View testID="detail-pure-repost-action-layout">
          <PostLayout
            post={requireFragment(
              requirePostById(posts, pureRepost.id).layout,
              'pure Repost action detail layout',
            )}
          />
        </View>
      </Section>
    </Catalog>
  );
}

function PostListCatalog({ onRetry }: PostsStoryArgs) {
  const data = usePostsStoryData();

  return (
    <Catalog>
      <Section title="Loading">
        <PostList loading />
      </Section>
      <Section title="Error and retry">
        <PostList error onRetry={onRetry} />
      </Section>
      <Section title="Empty profile">
        <PostList profile={data.emptyPostsProfile} />
      </Section>
      <Section title="Profile content">
        <PostList profile={data.contentPostsProfile} />
      </Section>
      <Section title="Home timeline content">
        <PostList homeTimeline={data.homeTimeline} />
      </Section>
    </Catalog>
  );
}

function ProductionRepostQuoteLists() {
  const data = usePostsStoryData();

  return (
    <Catalog>
      <StoryPathname testID="current-story-pathname" />
      <View testID="production-home-reposts">
        <PostList homeTimeline={data.homeTimeline} />
      </View>
      <View testID="production-profile-reposts">
        <PostList profile={data.contentPostsProfile} />
      </View>
    </Catalog>
  );
}

type ProductionReactionRequest = Readonly<{ postId: string; type: string }>;

function withReactionViewerState(storyPost: StoryPost): StoryPost & {
  viewerReactions: [];
} {
  return {
    ...storyPost,
    repostSource: storyPost.repostSource ? withReactionViewerState(storyPost.repostSource) : null,
    viewerReactions: [],
  };
}

function ProductionReactionMutationTargetsStory() {
  const [requests, setRequests] = useState<ProductionReactionRequest[]>([]);
  const environment = useMemo(() => {
    const selectedTypesByPost = new Map<string, Set<string>>();

    return new Environment({
      network: Network.create((request: RequestParameters, variables: Variables) => {
        if (request.name === 'SessionProviderQuery') {
          return Promise.resolve({
            data: {
              currentSession: {
                __typename: 'Session',
                id: 'session-production-reaction-targets',
                selectedProfile: {
                  __typename: 'Profile',
                  id: 'profile-production-reaction-targets',
                },
              },
              me: {
                __typename: 'Account',
                id: 'account-production-reaction-targets',
                name: 'Reaction Target Story',
              },
            },
          } as GraphQLResponse);
        }
        if (request.name === 'PostsStoriesQuery') {
          return Promise.resolve({
            data: {
              alternateComposerProfile,
              composerProfile,
              contentPostsProfile,
              emptyPostsProfile,
              homeTimeline,
              nodes: storyPosts.map(withReactionViewerState),
            },
          } as GraphQLResponse);
        }
        if (request.name === 'PostReactionControllerAddReactionMutation') {
          const postId = String(variables.postId);
          const type = String(variables.type);
          const target = requireStoryPostById(storyPosts, postId);
          const selectedTypes = selectedTypesByPost.get(postId) ?? new Set<string>();
          selectedTypes.add(type);
          selectedTypesByPost.set(postId, selectedTypes);
          setRequests((current) => [...current, { postId, type }]);
          return Promise.resolve({
            data: {
              addReaction: {
                post: {
                  __typename: 'Post',
                  id: postId,
                  reactionCounts: target.reactionCounts.map((entry) => ({
                    ...entry,
                    count: entry.count + (selectedTypes.has(entry.type) ? 1 : 0),
                  })),
                  viewerReactions: [...selectedTypes].map((selectedType) => ({
                    __typename: 'Reaction',
                    id: `reaction-${postId}-${selectedType}`,
                    type: selectedType,
                  })),
                },
                reaction: {
                  __typename: 'Reaction',
                  id: `reaction-${postId}-${type}`,
                  type,
                },
              },
            },
          } as GraphQLResponse);
        }
        return Promise.resolve({ data: {} } as GraphQLResponse);
      }),
      store: new Store(new RecordSource()),
    });
  }, []);

  return (
    <RelayEnvironmentProvider environment={environment}>
      <Suspense fallback={<Text>Reaction target fixture를 불러오는 중입니다.</Text>}>
        <SessionProvider>
          <ProductionReactionMutationSurfaces />
        </SessionProvider>
      </Suspense>
      <Text testID="production-reaction-request-log">{JSON.stringify(requests)}</Text>
    </RelayEnvironmentProvider>
  );
}

function ProductionReactionMutationSurfaces() {
  const data = usePostsStoryData();

  return (
    <Catalog>
      <View testID="production-home-reposts">
        <PostList homeTimeline={data.homeTimeline} />
      </View>
      <View testID="production-profile-reposts">
        <PostList profile={data.contentPostsProfile} />
      </View>
      <View testID="production-detail-ordinary">
        <PostLayout
          post={requireFragment(
            requirePostById(data.posts, shortPost.id).layout,
            'production ordinary detail',
          )}
        />
      </View>
      <View testID="production-detail-quote">
        <PostLayout
          post={requireFragment(
            requirePostById(data.posts, quotePost.id).layout,
            'production Quote detail',
          )}
        />
      </View>
      <View testID="production-detail-pure-repost">
        <PostLayout
          post={requireFragment(
            requirePostById(data.posts, pureRepost.id).layout,
            'production pure Repost detail',
          )}
        />
      </View>
    </Catalog>
  );
}

function RepostQuotePresentationStory({ postId }: { postId: string }) {
  const post = requireStoryPostById(storyPosts, postId);

  return (
    <Catalog>
      <StoryPathname testID="presentation-story-pathname" />
      <PostSourcePresentationView post={toPostSourcePresentationData(post)} />
    </Catalog>
  );
}

function ComposerStory() {
  return (
    <Catalog>
      <PostComposer profile={usePostsStoryData().composerProfile} />
    </Catalog>
  );
}

function ComposerPickerUnmountStory() {
  const [composerVisible, setComposerVisible] = useState(true);
  const profile = usePostsStoryData().composerProfile;

  return (
    <Catalog>
      <Pressable
        accessibilityLabel="Composer 닫기"
        accessibilityRole="button"
        onPress={() => setComposerVisible(false)}
      >
        <Text>Composer 닫기</Text>
      </Pressable>
      {composerVisible ? <PostComposer profile={profile} /> : null}
    </Catalog>
  );
}

function ReplyModalPresentationStory({ parentId = shortPost.id }: { parentId?: string }) {
  const [open, setOpen] = useState(true);
  const triggerRef = useRef<View>(null);
  const data = usePostsStoryData();
  const parent = requireFragment(
    requirePostById(data.posts, parentId).replySurface,
    'Reply Composer Parent',
  );

  return (
    <Catalog>
      <Pressable
        accessibilityLabel="Reply modal 다시 열기"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        ref={triggerRef}
      >
        <Text>Reply modal 다시 열기</Text>
      </Pressable>
      <ReplyComposerSurface
        onRequestClose={() => setOpen(false)}
        open={open}
        owner="list"
        parent={parent}
        profile={data.replyComposerProfile}
        triggerRef={triggerRef}
      />
      <Text testID="reply-modal-open-state">{open ? 'open' : 'closed'}</Text>
    </Catalog>
  );
}

const composerMediaAsset = {
  height: 96,
  uri: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96"%3E%3Crect width="96" height="96" fill="%236b7280"/%3E%3C/svg%3E',
  width: 96,
};

function ComposerMediaStatesStory() {
  const [media, setMedia] = useState<ComposerMediaItem[]>([
    { altText: '', asset: composerMediaAsset, key: 'uploading', state: 'uploading' },
    {
      altText: '회색 이미지의 대체 텍스트',
      asset: composerMediaAsset,
      key: 'ready',
      mediaId: 'media-ready',
      state: 'ready',
    },
    {
      altText: '',
      asset: composerMediaAsset,
      key: 'failed',
      state: 'failed',
    },
  ]);
  const [sensitiveMedia, setSensitiveMedia] = useState(true);

  return (
    <Catalog>
      <PostComposerMediaItems
        disabled={false}
        media={media}
        onAltTextChange={(key, altText) =>
          setMedia((items) => items.map((item) => (item.key === key ? { ...item, altText } : item)))
        }
        onRemove={(key) => setMedia((items) => items.filter((item) => item.key !== key))}
        onRetry={(item) =>
          setMedia((items) =>
            items.map((candidate) =>
              candidate.key === item.key ? { ...candidate, state: 'uploading' } : candidate,
            ),
          )
        }
        onSensitiveMediaChange={setSensitiveMedia}
        sensitiveMedia={sensitiveMedia}
      />
    </Catalog>
  );
}

function ReplyListSurfaceStory() {
  const data = usePostsStoryData();

  return (
    <Catalog>
      <StoryPathname testID="reply-success-pathname" />
      <PostList homeTimeline={data.homeTimeline} replyProfile={data.replyComposerProfile} />
    </Catalog>
  );
}

function ReplyDetailInlineStory() {
  const data = usePostsStoryData();
  const post = requireFragment(
    requirePostById(data.posts, shortPost.id).layout,
    'Reply detail inline Post',
  );

  return (
    <PostReplyCoordinatorProvider owner="detail" profile={data.replyComposerProfile}>
      <Catalog>
        <PostLayout post={post} />
      </Catalog>
    </PostReplyCoordinatorProvider>
  );
}

type ReplyComposerRequest = Readonly<{
  bodyText: string;
  replyParentId?: string;
  visibility: string;
}>;

function ReplyComposerContractStory() {
  const [createdPostIds, setCreatedPostIds] = useState<string[]>([]);
  const [requests, setRequests] = useState<ReplyComposerRequest[]>([]);
  const environment = useMemo(
    () =>
      new Environment({
        network: Network.create((request: RequestParameters, variables: Variables) => {
          if (request.name === 'PostsStoriesQuery') {
            return Promise.resolve({
              data: {
                alternateComposerProfile,
                composerProfile,
                contentPostsProfile,
                emptyPostsProfile,
                homeTimeline,
                nodes: storyPosts.map(withReactionViewerState),
              },
            } as GraphQLResponse);
          }
          if (request.name === 'PostComposerCreatePostMutation') {
            const input = variables.input as ReplyComposerRequest;
            setRequests((current) => [...current, input]);
            return Promise.resolve({
              data: {
                createPost: {
                  post: { __typename: 'Post', id: 'reply-created-in-story' },
                },
              },
            } as GraphQLResponse);
          }
          return Promise.resolve({ data: {} } as GraphQLResponse);
        }),
        store: new Store(new RecordSource()),
      }),
    [],
  );

  return (
    <RelayEnvironmentProvider environment={environment}>
      <Suspense fallback={<Text>Reply Composer fixture를 불러오는 중입니다.</Text>}>
        <ReplyComposerContractContents
          onPostCreated={(createdPost) =>
            setCreatedPostIds((current) => [...current, createdPost.id])
          }
        />
      </Suspense>
      <Text testID="reply-composer-request-log">{JSON.stringify(requests)}</Text>
      <Text testID="reply-composer-created-log">{JSON.stringify(createdPostIds)}</Text>
    </RelayEnvironmentProvider>
  );
}

function ReplyComposerContractContents({
  onPostCreated,
}: {
  onPostCreated: (post: Readonly<{ id: string }>) => void;
}) {
  const { composerProfile } = usePostsStoryData();

  return (
    <PostComposer
      onPostCreated={onPostCreated}
      profile={composerProfile}
      replyParentId="post-parent"
    />
  );
}

function ReplyComposerContextIsolationStory() {
  const [createdPostIds, setCreatedPostIds] = useState<string[]>([]);
  const [firstCommittedBody, setFirstCommittedBody] = useState<string | null>(null);
  const [alternateProfile, setAlternateProfile] = useState(false);
  const [parentId, setParentId] = useState('post-parent-a');
  const composerRoot = useRef<View>(null);
  const captureNextCommit = useRef(false);
  const environment = useMemo(
    () =>
      new Environment({
        network: Network.create(async (request: RequestParameters) => {
          if (request.name === 'PostsStoriesQuery') {
            return {
              data: {
                alternateComposerProfile,
                composerProfile,
                contentPostsProfile,
                emptyPostsProfile,
                homeTimeline,
                nodes: storyPosts.map(withReactionViewerState),
              },
            } as GraphQLResponse;
          }
          if (request.name === 'PostComposerCreatePostMutation') {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return {
              data: {
                createPost: { post: { __typename: 'Post', id: 'late-reply-created-in-story' } },
              },
            } as GraphQLResponse;
          }
          return { data: {} } as GraphQLResponse;
        }),
        store: new Store(new RecordSource()),
      }),
    [],
  );

  return (
    <RelayEnvironmentProvider environment={environment}>
      <View ref={composerRoot}>
        <Profiler
          id="reply-context-composer"
          onRender={() => {
            if (!captureNextCommit.current) {
              return;
            }
            const root = composerRoot.current as unknown as HTMLElement | null;
            const body = root?.querySelector<HTMLTextAreaElement>('[aria-label="답글 본문"]');
            if (!body) {
              return;
            }
            captureNextCommit.current = false;
            setFirstCommittedBody(body.value);
          }}
        >
          <Suspense fallback={<Text>Reply Composer context fixture를 불러오는 중입니다.</Text>}>
            <ReplyComposerContextIsolationContents
              alternateProfile={alternateProfile}
              onPostCreated={(createdPost) =>
                setCreatedPostIds((current) => [...current, createdPost.id])
              }
              parentId={parentId}
            />
          </Suspense>
        </Profiler>
      </View>
      <Pressable
        accessibilityLabel="다른 Parent로 전환"
        accessibilityRole="button"
        onPress={() => {
          captureNextCommit.current = true;
          setAlternateProfile(true);
          setParentId('post-parent-b');
        }}
      >
        <Text>다른 Parent로 전환</Text>
      </Pressable>
      <Text testID="reply-context-first-committed-body">{JSON.stringify(firstCommittedBody)}</Text>
      <Text testID="reply-context-created-log">{JSON.stringify(createdPostIds)}</Text>
    </RelayEnvironmentProvider>
  );
}

function ReplyComposerContextIsolationContents({
  alternateProfile,
  onPostCreated,
  parentId,
}: {
  alternateProfile: boolean;
  onPostCreated: (post: Readonly<{ id: string }>) => void;
  parentId: string;
}) {
  const data = usePostsStoryData();

  return (
    <PostComposer
      onPostCreated={onPostCreated}
      profile={alternateProfile ? data.alternateComposerProfile : data.composerProfile}
      replyParentId={parentId}
    />
  );
}

function createReplyComposerEnvironment({
  mutationDelay,
  queryDelay = 0,
}: {
  mutationDelay: number;
  queryDelay?: number;
}) {
  return new Environment({
    network: Network.create(async (request: RequestParameters) => {
      if (request.name === 'PostsStoriesQuery') {
        await new Promise((resolve) => setTimeout(resolve, queryDelay));
        return {
          data: {
            alternateComposerProfile,
            composerProfile,
            contentPostsProfile,
            emptyPostsProfile,
            homeTimeline,
            nodes: storyPosts.map(withReactionViewerState),
          },
        } as GraphQLResponse;
      }
      if (request.name === 'PostComposerCreatePostMutation') {
        await new Promise((resolve) => setTimeout(resolve, mutationDelay));
        return {
          data: {
            createPost: { post: { __typename: 'Post', id: 'old-environment-reply' } },
          },
        } as GraphQLResponse;
      }
      return { data: {} } as GraphQLResponse;
    }),
    store: new Store(new RecordSource()),
  });
}

function ReplyComposerEnvironmentIsolationStory() {
  const [createdPostIds, setCreatedPostIds] = useState<string[]>([]);
  const [closeRequests, setCloseRequests] = useState(0);
  const [environment, setEnvironment] = useState(() =>
    createReplyComposerEnvironment({ mutationDelay: 200 }),
  );
  const [firstCommittedState, setFirstCommittedState] = useState<{
    body: string;
    closeDisabled: boolean;
  } | null>(null);
  const captureNextCommit = useRef(false);
  const environmentGenerationRef = useRef(0);

  return (
    <RelayEnvironmentBoundary environment={environment} generationRef={environmentGenerationRef}>
      <View>
        <Suspense fallback={<Text>새 Reply Composer 문맥을 불러오는 중입니다.</Text>}>
          <ReplyComposerEnvironmentIsolationContents
            onSurfaceRender={() => {
              if (!captureNextCommit.current) {
                return;
              }
              const body = document.querySelector<HTMLTextAreaElement>('[aria-label="답글 본문"]');
              const close = document.querySelector<HTMLButtonElement>('[aria-label="닫기"]');
              if (!body || !close) {
                return;
              }
              captureNextCommit.current = false;
              setFirstCommittedState({ body: body.value, closeDisabled: close.disabled });
            }}
            onPostCreated={(createdPost) =>
              setCreatedPostIds((current) => [...current, createdPost.id])
            }
            onRequestClose={() => setCloseRequests((current) => current + 1)}
          />
        </Suspense>
      </View>
      <Pressable
        accessibilityLabel="Relay Environment 교체"
        accessibilityRole="button"
        onPress={() => {
          captureNextCommit.current = true;
          environmentGenerationRef.current += 1;
          setEnvironment(createReplyComposerEnvironment({ mutationDelay: 0, queryDelay: 400 }));
        }}
      >
        <Text>Relay Environment 교체</Text>
      </Pressable>
      <Text testID="reply-environment-first-committed-state">
        {JSON.stringify(firstCommittedState)}
      </Text>
      <Text testID="reply-environment-close-log">{closeRequests}</Text>
      <Text testID="reply-environment-created-log">{JSON.stringify(createdPostIds)}</Text>
    </RelayEnvironmentBoundary>
  );
}

function ReplyComposerEnvironmentIsolationContents({
  onPostCreated,
  onRequestClose,
  onSurfaceRender,
}: {
  onPostCreated: (post: Readonly<{ id: string }>) => void;
  onRequestClose: () => void;
  onSurfaceRender: () => void;
}) {
  const data = usePostsStoryData();
  const parent = requireFragment(
    requirePostById(data.posts, shortPost.id).replySurface,
    'Environment Reply Composer Parent',
  );

  return (
    <Profiler id="reply-environment-surface" onRender={onSurfaceRender}>
      <ReplyComposerSurface
        onPostCreated={onPostCreated}
        onRequestClose={onRequestClose}
        open
        owner="list"
        parent={parent}
        profile={data.replyComposerProfile}
      />
    </Profiler>
  );
}

function LinkedPostListItemStory() {
  const { posts } = usePostsStoryData();

  return (
    <Catalog>
      <StoryPathname testID="current-story-pathname" />
      <PostListItem post={requireFragment(requirePost(posts, 14).listItem, 'linked post item')} />
    </Catalog>
  );
}

function LongPureRepostListItemStory() {
  const { posts } = usePostsStoryData();

  return (
    <Catalog>
      <PostListItem
        post={requireFragment(
          requirePostById(posts, longPureRepost.id).listItem,
          'long pure repost list item',
        )}
      />
    </Catalog>
  );
}

function ProductionPostListItemStory({ postId }: { postId: string }) {
  const { posts } = usePostsStoryData();

  return (
    <Catalog>
      <StoryPathname testID="presentation-story-pathname" />
      <PostListItem
        post={requireFragment(
          requirePostById(posts, postId).listItem,
          `production post list item ${postId}`,
        )}
      />
    </Catalog>
  );
}

function StoryPathname({ testID }: { testID: string }) {
  return (
    <Text style={{ display: 'none' }} testID={testID}>
      {usePathname()}
    </Text>
  );
}

function PostLayoutReactionSummaryStory() {
  const { posts } = usePostsStoryData();

  return (
    <PostLayout
      post={requireFragment(
        requirePostById(posts, postLayoutReactionPost.id).layout,
        'post layout reaction summary',
      )}
    />
  );
}

function ThreadCatalog() {
  const { posts } = usePostsStoryData();

  return (
    <Catalog width={600}>
      <Section title="Reply thread · current anchor">
        <PostThreadLayout
          ancestors={threadItems.ancestors.map((item) => ({
            ...item,
            post: requirePostById(posts, item.id),
          }))}
          current={{
            ...threadItems.current,
            post: requirePostById(posts, threadItems.current.id),
          }}
          descendants={threadItems.descendants.map((item) => ({
            ...item,
            post: requirePostById(posts, item.id),
          }))}
          renderPost={({ item, role }) => (
            <View>
              {role === 'current' ? (
                <View testID={`post-thread-renderer-detail-${item.id}`}>
                  <PostLayout post={requireFragment(item.post.layout, 'thread current layout')} />
                </View>
              ) : (
                <View testID={`post-thread-renderer-list-${item.id}`}>
                  <PostListItem
                    post={requireFragment(item.post.listItem, 'thread list item')}
                    showDivider={false}
                  />
                </View>
              )}
              {item.post.repostSource ? (
                <View testID={`reply-quote-source-subtree-${item.post.repostSource.id}`} />
              ) : null}
            </View>
          )}
        />
      </Section>
    </Catalog>
  );
}

function ThreadNavigationCatalog() {
  const [selectedPostId, setSelectedPostId] = useState('없음');
  const items = [
    { connectedToPrevious: false, id: 'thread-current', post: '현재 Post' },
    { connectedToPrevious: true, id: 'thread-child', post: '하위 Reply' },
  ] as const;

  return (
    <Catalog width={390}>
      <PostThreadLayout
        ancestors={[]}
        current={items[0]}
        descendants={[items[1]]}
        renderPost={({ item }) => (
          <Pressable
            accessibilityLabel={`${item.post} 상세 선택`}
            accessibilityRole="link"
            onPress={() => setSelectedPostId(item.id)}
          >
            <Text>{item.post}</Text>
          </Pressable>
        )}
      />
      <Text testID="selected-thread-post">{selectedPostId}</Text>
    </Catalog>
  );
}

const meta = {
  beforeEach: () => {
    mocked(trackAnalytics).mockClear();
    resetImagePickerMock();
  },
  component: PostCatalog,
  decorators: [
    (Story) => (
      <PostReplyCoordinatorProvider owner="list" profile={null}>
        <Story />
      </PostReplyCoordinatorProvider>
    ),
  ],
  parameters: {
    relay: {
      data: {
        alternateComposerProfile,
        composerProfile,
        contentPostsProfile,
        emptyPostsProfile,
        homeTimeline,
        nodes: storyPosts.map(withReactionViewerState),
      },
      mutationResponse: { createPost: { post: { id: 'post-created-in-story' } } },
    },
    router: { pathname: '/@kosmo/post-1' },
  },
  title: 'KOSMO/Content/Posts',
} satisfies Meta<typeof PostCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BodyTimeAndLayoutStates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('짧은 본문 한 줄.')).toHaveAttribute('data-openpanel-replay-block', '');
    expect(canvas.getByText('미지원 문서는 안전한 Plain Text로 표시합니다.')).toHaveAttribute(
      'data-openpanel-replay-block',
      '',
    );
    expect(canvasElement.querySelector('a[href="/@user@remote.example"]')).toBeInTheDocument();
    expect(
      canvasElement.querySelector('a[href="/@user@remote.example/detail-remote"]'),
    ).toBeInTheDocument();
    const contentLink = canvas.getByRole('link', {
      name: /안전한 외부 링크, https:\/\/example\.com\/path/,
    });
    expect(contentLink).toBeVisible();
    expect(contentLink.closest('[data-openpanel-replay-block]')).not.toBeNull();
    expect(canvasElement.textContent).toContain('강제 개행을 함께 표시합니다.');
    expect(canvasElement.textContent).toContain(
      '강제 개행을 함께 표시합니다.\n\n두 번째 문단입니다.',
    );
    expect(canvas.getByText('미지원 문서는 안전한 Plain Text로 표시합니다.')).toBeVisible();
    expect(canvas.queryByText('실행하면 안 되는 구조')).not.toBeInTheDocument();
    expect(canvas.getByTestId('media-text').textContent).toBe('document text');
    expect(
      canvas.queryByText('이미지가 있는 문서는 안전한 Plain Text로 표시합니다.'),
    ).not.toBeInTheDocument();
    expect(canvas.getByTestId('media-only').textContent).toBe('');
    const quoteLayout = within(canvas.getByTestId('detail-quote-layout'));
    expect(quoteLayout.getAllByTestId('source-post-preview')).toHaveLength(1);
    expect(quoteLayout.getByTestId('source-post-body')).toHaveTextContent(
      '원문 작성자의 긴 본문과 줄바꿈을 표시합니다.',
    );
    const detailActionBar = quoteLayout.getByRole('toolbar', { name: '액션 바' });
    expect(detailActionBar.parentElement?.closest('a, [role="link"], [role="button"]')).toBeNull();
    expect(detailActionBar.parentElement?.lastElementChild).toBe(detailActionBar);
    expect(within(detailActionBar).getByRole('button', { name: '재게시' })).toHaveTextContent('3');
    const defaultActionBar = within(canvas.getByTestId('detail-default-action-layout')).getByRole(
      'toolbar',
      { name: '액션 바' },
    );
    expect(within(defaultActionBar).getByRole('button', { name: '재게시' })).toHaveTextContent('0');

    const pureRepostActionBar = within(
      canvas.getByTestId('detail-pure-repost-action-layout'),
    ).getByRole('toolbar', { name: '액션 바' });
    expect(
      within(pureRepostActionBar).getByRole('button', { name: '재게시 취소' }),
    ).toHaveTextContent('7');
    await userEvent.click(within(pureRepostActionBar).getByRole('button', { name: '재게시 취소' }));
    expect(await screen.findByRole('menu', { name: '재게시 메뉴' })).toBeVisible();
    expect(
      within(screen.getByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시 취소',
      }),
    ).toBeVisible();
  },
};

export const ListLoadingErrorEmptyAndContent: Story = {
  args: { onRetry: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('게시글 목록을 불러오는 중입니다.')).toBeVisible();
    expect(canvas.getByRole('alert')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
  render: (args) => <PostListCatalog onRetry={args.onRetry} />,
};

export const ProductionRepostQuoteListIntegration: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const homeRoot = canvas.getByTestId('production-home-reposts');
    const profileRoot = canvas.getByTestId('production-profile-reposts');
    const home = within(homeRoot);
    const profile = within(profileRoot);
    const pureRepostRow = home
      .getByText('재게시한 코스모 사용자님이 재게시함')
      .closest<HTMLElement>('[role="article"]');
    const quoteRow = home
      .getByText('이 원문에 덧붙이는 인용자의 본문입니다.')
      .closest<HTMLElement>('[role="article"]');
    const replyQuoteRow = home
      .getByText('답글 관계를 유지하는 인용입니다.')
      .closest<HTMLElement>('[role="article"]');
    const linkedSourceRow = home
      .getAllByText(/두 번째 문단입니다\./)[0]!
      .closest<HTMLElement>('[role="article"]');
    const quoteOfQuoteRow = home
      .getByText('Source Quote를 인용하는 outer Quote 본문입니다.')
      .closest<HTMLElement>('[role="article"]');
    const repostOfQuoteRow = profile
      .getByText('재게시한 코스모 사용자님이 재게시함')
      .closest<HTMLElement>('[role="article"]');
    const sourceNullQuoteRow = profile
      .getByText('원문을 더 이상 볼 수 없어도 남는 인용 본문입니다.')
      .closest<HTMLElement>('[role="article"]');

    expect(pureRepostRow).not.toBeNull();
    expect(quoteRow).not.toBeNull();
    expect(replyQuoteRow).not.toBeNull();
    expect(linkedSourceRow).not.toBeNull();
    expect(quoteOfQuoteRow).not.toBeNull();
    expect(repostOfQuoteRow).not.toBeNull();
    expect(sourceNullQuoteRow).not.toBeNull();
    const pureRepostActionBar = within(pureRepostRow!).getByRole('toolbar', {
      name: '액션 바',
    });
    const quoteActionBar = within(quoteRow!.parentElement!).getByRole('toolbar', {
      name: '액션 바',
    });
    const ordinaryActionBar = within(home.getAllByRole('article')[0]!).getByRole('toolbar', {
      name: '액션 바',
    });
    const ordinaryCard = ordinaryActionBar.closest<HTMLElement>('[role="article"]')!;
    const quoteCard = quoteRow!.parentElement!.parentElement!;
    const pureRepostAttributionLink = home
      .getByText('재게시한 코스모 사용자님이 재게시함')
      .closest<HTMLAnchorElement>('a')!;
    const pureRepostSourceRow = within(pureRepostRow!).getByTestId('post-list-standard-row');
    const quoteSourcePreview = within(quoteRow!).getByTestId('source-post-preview');
    const quoteSourceBody = within(quoteSourcePreview).getByTestId('source-post-body');
    const quoteReactionSummary = within(quoteCard).getByRole('button', {
      name: '🎉 반응 3개',
    });
    expect(pureRepostAttributionLink.getBoundingClientRect().height).toBe(20);
    expect(
      pureRepostSourceRow.getBoundingClientRect().top -
        pureRepostAttributionLink.getBoundingClientRect().bottom,
    ).toBeCloseTo(0, 0);
    expect(
      quoteReactionSummary.getBoundingClientRect().top -
        quoteSourcePreview.getBoundingClientRect().bottom,
    ).toBeCloseTo(8, 0);
    expect(
      quoteActionBar.getBoundingClientRect().top -
        quoteReactionSummary.getBoundingClientRect().bottom,
    ).toBeCloseTo(0, 0);
    expect(
      quoteSourcePreview.getBoundingClientRect().bottom -
        Number.parseFloat(getComputedStyle(quoteSourcePreview).borderBottomWidth) -
        quoteSourceBody.getBoundingClientRect().bottom,
    ).toBeCloseTo(4, 0);
    for (const [card, actionBar] of [
      [ordinaryCard, ordinaryActionBar],
      [quoteCard, quoteActionBar],
      [pureRepostRow!, pureRepostActionBar],
    ] as const) {
      const cardBounds = card.getBoundingClientRect();
      const actionBarBounds = actionBar.getBoundingClientRect();
      const borderBottomWidth = Number.parseFloat(getComputedStyle(card).borderBottomWidth);
      const actionBarSlotStyle = getComputedStyle(actionBar.parentElement!);
      expect(actionBarSlotStyle.paddingTop).toBe('0px');
      expect(actionBarSlotStyle.paddingBottom).toBe('4px');
      expect(cardBounds.bottom - borderBottomWidth - actionBarBounds.bottom).toBeCloseTo(4, 0);
      expect(getComputedStyle(card).borderBottomColor).toBe('rgb(242, 242, 242)');
    }
    for (const actionBar of [ordinaryActionBar, quoteActionBar, pureRepostActionBar]) {
      const actionBarSlot = actionBar.parentElement!;
      expect(actionBarSlot.closest('a, [role="link"], [role="button"]')).toBeNull();
      expect(actionBarSlot.lastElementChild).toBe(actionBar);
      expect(actionBarSlot.parentElement?.lastElementChild).toBe(actionBarSlot);
    }
    expect(
      within(ordinaryActionBar).getByRole('button', { name: '재게시 취소' }),
    ).toHaveTextContent('2');
    expect(within(quoteActionBar).getByRole('button', { name: '재게시' })).toHaveTextContent('3');
    expect(
      within(pureRepostActionBar).getByRole('button', { name: '재게시 취소' }),
    ).toHaveTextContent('7');
    expect(home.getAllByRole('article').map((row) => row.textContent)).toEqual([
      expect.stringContaining('짧은 본문 한 줄.'),
      expect.stringContaining('재게시한 코스모 사용자님이 재게시함'),
      expect.stringContaining('이 원문에 덧붙이는 인용자의 본문입니다.'),
      expect.stringContaining('답글 관계를 유지하는 인용입니다.'),
      expect.stringContaining('Source Quote를 인용하는 outer Quote 본문입니다.'),
      expect.stringContaining('두 번째 문단입니다.'),
    ]);
    expect(within(quoteRow!).getByTestId('source-post-preview')).toBeVisible();
    expect(within(replyQuoteRow!).getByTestId('source-post-preview')).toBeVisible();
    expect(
      replyQuoteRow!.querySelector('a[href="/@source@remote.example/post-source"]'),
    ).toBeInTheDocument();
    expect(sourceNullQuoteRow!.querySelector('a[href="/@reposter"]')).toBeInTheDocument();
    expect(
      sourceNullQuoteRow!.querySelector('a[href="/@reposter/post-quote-source-null"]'),
    ).toBeInTheDocument();
    expect(
      within(sourceNullQuoteRow!).queryByTestId('source-post-preview'),
    ).not.toBeInTheDocument();
    expect(
      within(sourceNullQuoteRow!).queryByTestId('nested-source-post-placeholder'),
    ).not.toBeInTheDocument();
    expect(
      sourceNullQuoteRow!.querySelector('a[href^="/@source@remote.example"]'),
    ).not.toBeInTheDocument();

    expect(pureRepostRow!.querySelector('a[href="/@reposter"]')).toBeInTheDocument();
    expect(
      pureRepostRow!.querySelector('a[href="/@source@remote.example/post-source"]'),
    ).toBeInTheDocument();
    expect(quoteRow!.querySelector('a[href="/@reposter/post-quote"]')).toBeInTheDocument();
    expect(quoteRow!.querySelector('a[href="/@source@remote.example"]')).toBeInTheDocument();
    expect(
      quoteOfQuoteRow!.querySelector('a[href="/@deep-source@remote.example/post-source-depth-2"]'),
    ).not.toBeInTheDocument();
    expect(
      quoteOfQuoteRow!.querySelectorAll('a[href="/@source@remote.example/post-source-quote"]'),
    ).toHaveLength(1);
    expect(
      repostOfQuoteRow!.querySelectorAll('a[href="/@source@remote.example/post-source-quote"]'),
    ).toHaveLength(1);
    expect(quoteOfQuoteRow!.querySelectorAll('[data-testid="source-post-preview"]')).toHaveLength(
      1,
    );
    expect(
      within(quoteOfQuoteRow!).queryByRole('link', { name: '인용한 게시글 보기' }),
    ).not.toBeInTheDocument();
    expect(
      within(repostOfQuoteRow!).queryByRole('link', { name: '인용한 게시글 보기' }),
    ).not.toBeInTheDocument();
    expect(
      within(quoteOfQuoteRow!).getByText('첫 번째 direct Source Quote의 본문입니다.'),
    ).toBeVisible();
    expect(
      within(repostOfQuoteRow!).getByText('첫 번째 direct Source Quote의 본문입니다.'),
    ).toBeVisible();
    expect(quoteOfQuoteRow!.textContent).not.toContain(
      '두 번째 Source의 본문은 목록에서 full preview하지 않습니다.',
    );
    expect(quoteOfQuoteRow!.querySelector('a a')).toBeNull();
    expect(repostOfQuoteRow!.querySelector('a a')).toBeNull();
    expect(linkedSourceRow!.querySelector('a a')).toBeNull();
    expect(linkedSourceRow!.querySelector('[role="link"] [role="link"]')).toBeNull();

    const openURL = fn(async () => undefined);
    const originalOpenURL = Linking.openURL;
    Linking.openURL = openURL;
    try {
      await userEvent.click(within(quoteRow!).getByTestId('post-body'));
      expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
        '/@reposter/post-quote',
      );

      await userEvent.click(within(replyQuoteRow!).getByTestId('post-body'));
      expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
        '/@reposter/post-reply-quote',
      );

      await userEvent.click(
        within(linkedSourceRow!).getAllByLabelText(
          '안전한 외부 링크, https://example.com/path',
        )[0]!,
      );
      await expect(openURL).toHaveBeenCalledWith('https://example.com/path');
      expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
        '/@reposter/post-reply-quote',
      );
      await userEvent.click(within(quoteOfQuoteRow!).getByTestId('source-post-body'));
      expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
        '/@source@remote.example/post-source-quote',
      );
    } finally {
      Linking.openURL = originalOpenURL;
    }
  },
  render: () => <ProductionRepostQuoteLists />,
};

export const ProductionReactionMutationTargets: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const home = within(await canvas.findByTestId('production-home-reposts'));
    const ordinaryActionBar = within(home.getAllByRole('article')[0]!).getByRole('toolbar', {
      name: '액션 바',
    });
    const quoteActionBar = within(
      home
        .getByText('이 원문에 덧붙이는 인용자의 본문입니다.')
        .closest<HTMLElement>('[role="article"]')!.parentElement!,
    ).getByRole('toolbar', { name: '액션 바' });
    const pureRepostActionBar = within(
      home
        .getByText('재게시한 코스모 사용자님이 재게시함')
        .closest<HTMLElement>('[role="article"]')!,
    ).getByRole('toolbar', { name: '액션 바' });
    const ordinaryRoot = ordinaryActionBar.closest<HTMLElement>('[role="article"]')!;
    const quoteRoot = home
      .getByText('이 원문에 덧붙이는 인용자의 본문입니다.')
      .closest<HTMLElement>('[role="article"]')!.parentElement!.parentElement!;
    const pureRepostRoot = pureRepostActionBar.closest<HTMLElement>('[role="article"]')!;
    const detailTargets = [
      ['production-detail-ordinary', '❤️ 반응 2개'],
      ['production-detail-quote', '🎉 반응 3개'],
      ['production-detail-pure-repost', '👀 반응 4개'],
    ] as const;

    for (const [testId, summaryLabel] of detailTargets) {
      const detail = within(canvas.getByTestId(testId));
      expect(detail.getByRole('button', { name: summaryLabel })).toBeVisible();
      expect(detail.getByRole('button', { name: '반응' })).toBeEnabled();
    }
    expect(
      within(canvas.getByTestId('production-detail-pure-repost')).queryByRole('button', {
        name: '🌈 반응 99개',
      }),
    ).toBeNull();

    const surfaces = [
      {
        actionBar: ordinaryActionBar,
        root: ordinaryRoot,
        summaryLabel: '❤️ 반응 2개',
      },
      {
        actionBar: quoteActionBar,
        root: quoteRoot,
        summaryLabel: '🎉 반응 3개',
      },
      {
        actionBar: pureRepostActionBar,
        root: pureRepostRoot,
        summaryLabel: '👀 반응 4개',
      },
    ];

    for (const [index, { actionBar, root, summaryLabel }] of surfaces.entries()) {
      const summaryToken = within(root).getByRole('button', { name: summaryLabel });
      await userEvent.click(summaryToken);
      expect(screen.queryByRole('dialog', { name: '반응한 프로필' })).toBeNull();
      await waitFor(() => {
        const requests = JSON.parse(
          canvas.getByTestId('production-reaction-request-log').textContent ?? '[]',
        ) as ProductionReactionRequest[];
        expect(requests).toHaveLength(index + 1);
      });
      await waitFor(() =>
        expect(within(actionBar).getByRole('button', { name: '반응' })).toHaveAttribute(
          'aria-pressed',
          'true',
        ),
      );
    }

    const requests = JSON.parse(
      canvas.getByTestId('production-reaction-request-log').textContent ?? '[]',
    ) as ProductionReactionRequest[];
    expect(requests.map(({ postId }) => postId)).toEqual([
      shortPost.id,
      quotePost.id,
      pureRepost.repostSource!.id,
    ]);
  },
  render: () => <ProductionReactionMutationTargetsStory />,
};

export const ProductionRepostFailureToast: Story = {
  parameters: {
    relay: {
      data: {
        alternateComposerProfile,
        composerProfile,
        contentPostsProfile,
        emptyPostsProfile,
        homeTimeline,
        nodes: storyPosts.map(withReactionViewerState),
      },
      mutationError: 'repost mutation failed',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const home = within(canvas.getByTestId('production-home-reposts'));
    const quoteActionBar = within(
      home
        .getByText('이 원문에 덧붙이는 인용자의 본문입니다.')
        .closest<HTMLElement>('[role="article"]')!.parentElement!,
    ).getByRole('toolbar', { name: '액션 바' });
    const pureRepostActionBar = within(
      home
        .getByText('재게시한 코스모 사용자님이 재게시함')
        .closest<HTMLElement>('[role="article"]')!,
    ).getByRole('toolbar', { name: '액션 바' });

    await userEvent.click(within(quoteActionBar).getByRole('button', { name: '재게시' }));
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시하기',
      }),
    );
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(within(quoteActionBar).getByRole('button', { name: '재게시' })).toHaveTextContent('3');

    await userEvent.click(within(pureRepostActionBar).getByRole('button', { name: '재게시 취소' }));
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시 취소',
      }),
    );
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(canvas.getAllByRole('alert')).toHaveLength(1);
    expect(
      within(pureRepostActionBar).getByRole('button', { name: '재게시 취소' }),
    ).toHaveTextContent('7');
  },
  render: () => <ProductionRepostQuoteLists />,
};

export const PureRepost: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const article = canvas.getByRole('article');
    const standardRow = within(article).getByTestId('post-list-standard-row');
    const sourceAvatar = within(standardRow).getByLabelText(
      '아주 긴 Source 작성자 표시 이름 프로필 이미지',
    );

    expect(canvas.getAllByText('재게시한 코스모 사용자님이 재게시함')).toHaveLength(1);
    expect(canvas.getAllByRole('article')).toHaveLength(1);
    expect(article.querySelector('[role="article"]')).toBeNull();
    expect(article.querySelectorAll('[data-testid="post-list-standard-row"]')).toHaveLength(1);
    expect(article.querySelector('[data-testid="post-source-presentation"]')).toBeNull();
    expect(article.querySelector('[data-testid="source-post-preview"]')).toBeNull();
    expect(getComputedStyle(article).borderBottomWidth).toBe('1px');
    expect(sourceAvatar.getBoundingClientRect().width).toBe(48);
    expect(sourceAvatar.getBoundingClientRect().height).toBe(48);
    expect(article.querySelector('a a')).toBeNull();
    expect(article.querySelector('[role="link"] [role="link"]')).toBeNull();

    const repostAuthorLink = canvas.getByLabelText('재게시한 코스모 사용자 프로필 보기');
    await userEvent.click(repostAuthorLink);
    expect(canvas.getByTestId('presentation-story-pathname')).toHaveTextContent('/@reposter');

    const sourceAuthorLink = standardRow.querySelector<HTMLAnchorElement>(
      'a[href="/@source@remote.example"]',
    );
    expect(sourceAuthorLink).not.toBeNull();
    await userEvent.click(sourceAuthorLink!);
    expect(canvas.getByTestId('presentation-story-pathname')).toHaveTextContent(
      '/@source@remote.example',
    );

    const sourceTimestampLink = standardRow.querySelector<HTMLAnchorElement>(
      'a[href="/@source@remote.example/post-source"]',
    );
    expect(sourceTimestampLink).not.toBeNull();
    expect(sourceTimestampLink!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(sourceTimestampLink!.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await userEvent.click(sourceTimestampLink!);
    expect(canvas.getByTestId('presentation-story-pathname')).toHaveTextContent(
      '/@source@remote.example/post-source',
    );

    await userEvent.click(
      within(standardRow).getByText(/원문 작성자의 긴 본문과 줄바꿈을 표시합니다/),
    );
    expect(canvas.getByTestId('presentation-story-pathname')).toHaveTextContent(
      '/@source@remote.example/post-source',
    );
  },
  render: () => <ProductionPostListItemStory postId="post-repost" />,
};

export const PureRepostOfQuote: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const article = canvas.getByRole('article');
    const standardRow = within(article).getByTestId('post-list-standard-row');

    expect(canvas.getAllByRole('article')).toHaveLength(1);
    expect(article.querySelector('[role="article"]')).toBeNull();
    expect(within(standardRow).getByText('아주 긴 Source 작성자 표시 이름')).toBeVisible();
    expect(
      within(standardRow).getByText('첫 번째 direct Source Quote의 본문입니다.'),
    ).toBeVisible();
    expect(article.querySelector('a a')).toBeNull();
    expect(article.querySelector('[role="link"] [role="link"]')).toBeNull();

    await userEvent.click(
      within(standardRow).getByText('첫 번째 direct Source Quote의 본문입니다.'),
    );
    expect(canvas.getByTestId('presentation-story-pathname')).toHaveTextContent(
      '/@source@remote.example/post-source-quote',
    );
  },
  render: () => <ProductionPostListItemStory postId="post-repost-of-quote" />,
};

export const Quote: Story = {
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('이 원문에 덧붙이는 인용자의 본문입니다.')).toBeVisible();
    expect(canvas.getByTestId('post-timestamp')).toHaveTextContent(
      formatTimelineTimestamp(quotePost.createdAt),
    );
    const preview = canvas.getByTestId('source-post-preview');
    expect(preview.textContent).toContain('원문 작성자의 긴 본문과 줄바꿈을 표시합니다.');
    expect(canvas.getAllByRole('link')).toHaveLength(4);
    expect(within(preview).getAllByRole('link')).toHaveLength(2);
    expect(within(preview).queryByRole('button')).not.toBeInTheDocument();
    expect(canvas.queryByTestId('nested-source-post-placeholder')).not.toBeInTheDocument();
    const postBody = canvas.getByTestId('post-body');
    expect(postBody.getBoundingClientRect().height).toBeLessThan(44);
    expect(postBody.closest('[role="link"]')).toBeNull();

    await userEvent.click(postBody);
    expect(within(canvasElement).getByTestId('presentation-story-pathname')).toHaveTextContent(
      '/@reposter/post-quote',
    );
    const pathnameBeforePadding = within(canvasElement).getByTestId(
      'presentation-story-pathname',
    ).textContent;
    await userEvent.click(preview);
    expect(within(canvasElement).getByTestId('presentation-story-pathname')).toHaveTextContent(
      pathnameBeforePadding ?? '',
    );
  },
  render: () => <RepostQuotePresentationStory postId="post-quote" />,
};

export const QuoteOfQuote: Story = {
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('Source Quote를 인용하는 outer Quote 본문입니다.')).toBeVisible();
    expect(canvas.queryAllByTestId('source-post-preview')).toHaveLength(1);
    expect(canvas.getByText('아주 긴 Source 작성자 표시 이름')).toBeVisible();
    expect(canvas.getByText('첫 번째 direct Source Quote의 본문입니다.')).toBeVisible();
    expect(root.textContent).not.toContain(
      '두 번째 Source의 본문은 목록에서 full preview하지 않습니다.',
    );
    expect(canvas.getAllByLabelText('원문 게시글 보기')).toHaveLength(1);
    expect(canvas.queryByLabelText('인용한 게시글 보기')).not.toBeInTheDocument();
    expect(root.querySelector('a a')).toBeNull();
    expect(root.querySelector('[role="link"] [role="link"]')).toBeNull();
    await userEvent.click(canvas.getByTestId('source-post-body'));
    expect(within(canvasElement).getByTestId('presentation-story-pathname')).toHaveTextContent(
      '/@source@remote.example/post-source-quote',
    );
  },
  render: () => <RepostQuotePresentationStory postId="post-quote-of-quote" />,
};

export const ReplyQuote: Story = {
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('답글 관계를 유지하는 인용입니다.')).toBeVisible();
    expect(canvas.getByTestId('source-post-preview')).toBeVisible();

    await userEvent.click(canvas.getByTestId('post-body'));
    expect(within(canvasElement).getByTestId('presentation-story-pathname')).toHaveTextContent(
      '/@reposter/post-reply-quote',
    );
  },
  render: () => <RepostQuotePresentationStory postId="post-reply-quote" />,
};

export const QuoteWithoutSource: Story = {
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('원문을 더 이상 볼 수 없어도 남는 인용 본문입니다.')).toBeVisible();
    expect(canvas.queryByTestId('source-post-preview')).not.toBeInTheDocument();
    expect(canvas.getAllByRole('link')).toHaveLength(2);
  },
  render: () => <RepostQuotePresentationStory postId="post-quote-source-null" />,
};

export const OrdinaryPost: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const article = canvas.getByRole('article');
    const standardRow = within(article).getByTestId('post-list-standard-row');
    const bodyShortcut = within(standardRow).getByTestId('post-list-row-body');
    expect(canvas.getByText('짧은 본문 한 줄.')).toBeVisible();
    expect(canvas.queryByTestId('source-post-preview')).not.toBeInTheDocument();
    expect(article.querySelectorAll('[data-testid="post-list-standard-row"]')).toHaveLength(1);
    expect(bodyShortcut).not.toHaveAttribute('role', 'link');
    expect(bodyShortcut.closest('[role="link"]')).toBeNull();
    const timestampLink = standardRow.querySelector<HTMLAnchorElement>('a[href="/@kosmo/short"]');
    expect(timestampLink).not.toBeNull();
    expect(timestampLink!.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(timestampLink!.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    await userEvent.click(bodyShortcut);
    expect(canvas.getByTestId('presentation-story-pathname')).toHaveTextContent('/@kosmo/short');
  },
  render: () => <ProductionPostListItemStory postId="short" />,
};

export const InvalidContentlessReplySource: Story = {
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByTestId('post-source-presentation')).not.toBeInTheDocument();
  },
  render: () => <RepostQuotePresentationStory postId="post-invalid-contentless-reply-source" />,
};

export const LinkedSourceQuote: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const postBody = canvas.getByTestId('post-body');
    const sourcePreview = canvas.getByTestId('source-post-preview');
    const openURL = fn(async () => undefined);
    const originalOpenURL = Linking.openURL;
    Linking.openURL = openURL;

    try {
      expect(canvasElement.querySelector('[role="link"] [role="link"]')).toBeNull();
      await userEvent.click(
        within(postBody).getByLabelText('안전한 외부 링크, https://example.com/path'),
      );
      await userEvent.click(
        within(sourcePreview).getByLabelText('안전한 외부 링크, https://example.com/path'),
      );
      await expect(openURL).toHaveBeenCalledTimes(2);
      expect(canvas.getByTestId('presentation-story-pathname')).toHaveTextContent('/@kosmo/post-1');

      await userEvent.click(within(postBody).getByText(/두 번째 문단입니다\./));
      expect(canvas.getByTestId('presentation-story-pathname')).toHaveTextContent(
        '/@reposter/post-quote-linked-source',
      );
    } finally {
      Linking.openURL = originalOpenURL;
    }
  },
  render: () => <RepostQuotePresentationStory postId="post-quote-linked-source" />,
};

export const RepostQuoteLongContentMobile: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    expect(root).toBeVisible();
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
  render: () => <RepostQuotePresentationStory postId="post-quote-long" />,
};

export const ProductionPureRepostLongAuthorMobile: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async ({ canvasElement }) => {
    const article = within(canvasElement).getByRole('article');
    expect(article).toBeVisible();
    expect(article.scrollWidth).toBeLessThanOrEqual(article.clientWidth);
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
  render: () => <LongPureRepostListItemStory />,
};

export const PostLayoutOwnsReactionSummary: Story = {
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByRole('button', { name: '❤️ 반응 2개' })).toBeVisible();
  },
  render: () => <PostLayoutReactionSummaryStory />,
};

export const LinkedBodyKeepsDetailNavigationIsolated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const openURL = fn(async () => undefined);
    const originalOpenURL = Linking.openURL;
    Linking.openURL = openURL;

    try {
      expect(canvasElement.querySelector('a a')).toBeNull();
      expect(canvasElement.querySelector('[role="link"] [role="link"]')).toBeNull();
      await userEvent.click(canvas.getByLabelText('안전한 외부 링크, https://example.com/path'));
      await expect(openURL).toHaveBeenCalledWith('https://example.com/path');
      await expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
        '/@kosmo/post-1',
      );

      await userEvent.click(canvas.getByTestId('post-list-row-body'));
      await expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
        '/@kosmo/linked',
      );
    } finally {
      Linking.openURL = originalOpenURL;
    }
  },
  render: () => <LinkedPostListItemStory />,
};

export const ReplyThreadPresentation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const thread = canvas.getByTestId('post-thread');
    const rows = Array.from(thread.children) as HTMLElement[];

    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'post-thread-item-thread-root',
      'post-thread-item-thread-parent',
      'post-thread-current-thread-current',
      'post-thread-item-thread-child',
      'post-thread-item-thread-sibling',
      'post-thread-item-thread-reply-quote',
    ]);
    const approvedDividerColumnLeft = canvas
      .getByText('지금 보고 있는 Reply입니다.')
      .getBoundingClientRect().left;
    expect(canvas.queryAllByTestId(/^post-thread-divider-/)).toHaveLength(rows.length - 1);
    rows.forEach((row, index) => {
      const dividers = within(row).queryAllByTestId(/^post-thread-divider-/);

      if (index === rows.length - 1) {
        expect(dividers).toHaveLength(0);
        return;
      }

      expect(dividers).toHaveLength(1);
      const divider = dividers[0]!;
      const dividerBounds = divider.getBoundingClientRect();
      const rowBounds = row.getBoundingClientRect();
      expect(dividerBounds.height).toBeCloseTo(1, 0);
      expect(dividerBounds.left - rowBounds.left).toBeCloseTo(64, 0);
      expect(dividerBounds.left).toBeCloseTo(approvedDividerColumnLeft, 0);
      expect(rowBounds.right - dividerBounds.right).toBeCloseTo(8, 0);
      for (const connector of within(row).queryAllByTestId(/^post-thread-connector-/)) {
        expect(connector.getBoundingClientRect().right).toBeLessThan(dividerBounds.left);
      }
      expect(window.getComputedStyle(divider).backgroundColor).toBe('rgb(242, 242, 242)');
    });
    const currentRow = canvas.getByTestId('post-thread-current-thread-current');
    expect(window.getComputedStyle(currentRow).borderTopWidth).toBe('0px');
    expect(window.getComputedStyle(currentRow).borderBottomWidth).toBe('0px');
    for (const rowId of [
      'post-thread-item-thread-root',
      'post-thread-item-thread-child',
      'post-thread-item-thread-sibling',
    ]) {
      expect(
        window.getComputedStyle(within(canvas.getByTestId(rowId)).getByRole('article'))
          .borderBottomWidth,
      ).toBe('0px');
    }
    expect(thread.textContent).toContain('대화의 시작입니다.');
    expect(thread.textContent).toContain('지금 보고 있는 Reply입니다.');
    expect(thread.textContent).toContain('현재 Reply에 이어진 답글입니다.');
    expect(canvas.getByTestId('post-thread-current-thread-current')).toBeVisible();
    expect(canvas.getByTestId('post-thread-renderer-list-thread-root')).toBeVisible();
    expect(canvas.getByTestId('post-thread-renderer-list-thread-parent')).toBeVisible();
    expect(canvas.getByTestId('post-thread-renderer-detail-thread-current')).toBeVisible();
    expect(canvas.getByTestId('post-thread-renderer-list-thread-child')).toBeVisible();
    expect(canvas.getByTestId('post-thread-renderer-list-thread-reply-quote')).toBeVisible();
    const currentArticles = canvas.getAllByRole('article', { current: true });
    expect(currentArticles).toHaveLength(1);
    expect(currentArticles[0]).toBe(canvas.getByTestId('post-thread-current-thread-current'));
    expect(within(currentArticles[0]).getByRole('link', { name: /코스모 작가/ })).toBeVisible();
    expect(canvas.queryAllByRole('article', { current: true })).toHaveLength(1);
    for (const article of canvas.getAllByRole('article')) {
      if (article !== currentArticles[0]) {
        expect(article).not.toHaveAttribute('aria-current', 'true');
      }
    }
    expect(
      canvasElement.querySelector(
        '[data-testid^="post-thread-connector-"][data-testid$="-thread-root-before"]',
      ),
    ).toBeNull();
    expect(
      canvas.getByTestId('post-thread-connector-thread-root-thread-parent-after'),
    ).toBeVisible();
    expect(
      canvas.getByTestId('post-thread-connector-thread-root-thread-parent-before'),
    ).toBeVisible();
    expect(
      canvas.getByTestId('post-thread-connector-thread-parent-thread-current-after'),
    ).toBeVisible();
    expect(
      canvas.getByTestId('post-thread-connector-thread-parent-thread-current-before'),
    ).toBeVisible();
    expect(
      canvas.getByTestId('post-thread-connector-thread-current-thread-child-after'),
    ).toBeVisible();
    expect(
      canvas.getByTestId('post-thread-connector-thread-current-thread-child-before'),
    ).toBeVisible();
    expect(
      canvas.queryByTestId('post-thread-connector-thread-child-thread-sibling-after'),
    ).toBeNull();
    expect(
      canvas.queryByTestId('post-thread-connector-thread-child-thread-sibling-before'),
    ).toBeNull();
    expect(
      canvas.getByTestId('post-thread-connector-thread-sibling-thread-reply-quote-after'),
    ).toBeVisible();
    expect(
      canvas.getByTestId('post-thread-connector-thread-sibling-thread-reply-quote-before'),
    ).toBeVisible();
    expect(
      canvasElement.querySelector(
        '[data-testid^="post-thread-connector-thread-reply-quote-"][data-testid$="-after"]',
      ),
    ).toBeNull();

    const replyQuote = within(canvas.getByTestId('post-thread-item-thread-reply-quote'));
    expect(replyQuote.getByText('Reply이면서 Quote인 Post의 자체 Content입니다.')).toBeVisible();
    expect(
      replyQuote.getByTestId('reply-quote-source-subtree-thread-quote-source'),
    ).toBeEmptyDOMElement();
    expect(replyQuote.getByTestId('source-post-preview')).toBeVisible();
    expect(replyQuote.getByText('인용된 Source 본문입니다.')).toBeVisible();
  },
  render: () => <ThreadCatalog />,
};

export const ReplyThreadMockNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: '하위 Reply 상세 선택' }));
    expect(canvas.getByTestId('selected-thread-post')).toHaveTextContent('thread-child');
  },
  render: () => <ThreadNavigationCatalog />,
};

export const PostDetailThreadRoute: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailQuery: {
          data: {
            currentSession: null,
            node: {
              ...routeCurrentPost,
              reactionCounts: routeCurrentPostReactionCounts,
              replyAncestors: [
                { ...routeParentPost, repostSource: routeSourcePost },
                routeRootPost,
              ],
              replyDescendants: {
                edges: [
                  { cursor: 'route-child', node: routeChildPost },
                  { cursor: 'route-sibling', node: routeSiblingPost },
                  { cursor: 'route-reply-quote', node: routeReplyQuotePost },
                  { cursor: 'route-source-null', node: routeSourceNullPost },
                ],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      },
    },
    router: {
      params: {
        postId: routeCurrentPost.id,
        profileHandle: routeCurrentPost.profile.relativeHandle,
      },
      pathname: `/${routeCurrentPost.profile.relativeHandle}/${routeCurrentPost.id}`,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const thread = await canvas.findByTestId('post-thread');
    const rows = Array.from(thread.children) as HTMLElement[];
    const heading = canvas.getByRole('heading', { name: '게시글' });
    const backButton = canvas.getByRole('button', { name: '뒤로 가기' });

    expect(heading.parentElement?.getBoundingClientRect().height).toBe(64);
    expect(backButton.getBoundingClientRect().height).toBe(44);
    expect(heading.parentElement).toContainElement(backButton);
    expect(heading.parentElement?.parentElement).toHaveStyle({ position: 'sticky', top: '0px' });
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'post-thread-item-route-root',
      'post-thread-item-route-parent',
      'post-thread-current-route-current',
      'post-thread-item-route-child',
      'post-thread-item-route-sibling',
      'post-thread-item-route-reply-quote',
      'post-thread-item-route-source-null',
    ]);
    expect(canvas.queryAllByTestId(/^post-thread-divider-/)).toHaveLength(rows.length - 1);
    expect(
      window.getComputedStyle(
        within(canvas.getByTestId('post-thread-item-route-root')).getByRole('article'),
      ).borderBottomWidth,
    ).toBe('0px');
    expect(canvas.getByText('Reply+Quote 자체 Content')).toBeVisible();
    const reactionButton = canvas.getByRole('button', { name: '❤️ 반응 2개' });
    expect(reactionButton).toBeVisible();
    const ancestorQuote = within(canvas.getByTestId('post-thread-item-route-parent'));
    expect(ancestorQuote.getAllByText('Source 본문')).toHaveLength(1);
    expect(ancestorQuote.getAllByTestId('source-post-preview')).toHaveLength(1);
    expect(
      Math.abs(
        reactionButton.getBoundingClientRect().left -
          canvas.getByText('현재 Reply 본문').getBoundingClientRect().left,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      ancestorQuote.getByTestId('source-post-preview').getBoundingClientRect().left,
    ).toBeGreaterThanOrEqual(
      canvas
        .getByTestId('post-thread-connector-route-root-route-parent-before')
        .getBoundingClientRect().right,
    );
    const connectorClearance = (
      rowId: string,
      beforeConnectorId: string,
      afterConnectorId: string,
    ) => {
      const row = canvas.getByTestId(rowId);
      const avatar = row.querySelector<HTMLElement>('[aria-label$="프로필 이미지"]');
      const before = canvas.getByTestId(beforeConnectorId);
      const after = canvas.getByTestId(afterConnectorId);

      expect(avatar).not.toBeNull();

      return {
        after: Math.round(
          after.getBoundingClientRect().top - avatar!.getBoundingClientRect().bottom,
        ),
        before: Math.round(
          avatar!.getBoundingClientRect().top - before.getBoundingClientRect().bottom,
        ),
        rounded: [before, after].every(
          (connector) => Number.parseFloat(window.getComputedStyle(connector).borderRadius) > 0,
        ),
      };
    };
    expect({
      current: connectorClearance(
        'post-thread-current-route-current',
        'post-thread-connector-route-parent-route-current-before',
        'post-thread-connector-route-current-route-child-after',
      ),
      parent: connectorClearance(
        'post-thread-item-route-parent',
        'post-thread-connector-route-root-route-parent-before',
        'post-thread-connector-route-parent-route-current-after',
      ),
    }).toEqual({
      current: { after: 4, before: 4, rounded: true },
      parent: { after: 4, before: 4, rounded: true },
    });
    const descendantQuote = within(canvas.getByTestId('post-thread-item-route-reply-quote'));
    expect(descendantQuote.getAllByText('Source 본문')).toHaveLength(1);
    expect(descendantQuote.getAllByTestId('source-post-preview')).toHaveLength(1);
    expect(canvas.queryByTestId('post-thread-source-route-source')).not.toBeInTheDocument();
    expect(canvas.queryByTestId('post-thread-source-route-source-null')).not.toBeInTheDocument();
    expect(canvas.getByText('Source가 없어도 남는 Content')).toBeVisible();
    expect(
      canvas.getByTestId('post-thread-connector-route-current-route-child-after'),
    ).toBeVisible();
    expect(
      canvas.queryByTestId('post-thread-connector-route-child-route-sibling-after'),
    ).toBeNull();
    await userEvent.click(canvas.getByText('Child 본문'));
    expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent('/@kosmo/route-child');
    await userEvent.click(descendantQuote.getByTestId('source-post-body'));
    expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent('/@kosmo/route-source');
  },
  render: () => (
    <>
      <Text testID="current-story-pathname">{usePathname()}</Text>
      <PostDetailScreen />
    </>
  ),
};

export const PostDetailCurrentQuoteSourceNavigation: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailQuery: {
          data: {
            currentSession: null,
            node: {
              ...withReactionViewerState(quotePost),
              reactionCounts: [],
              replyAncestors: [],
              replyDescendants: {
                edges: [],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      },
    },
    router: {
      params: {
        postId: quotePost.id,
        profileHandle: quotePost.profile.relativeHandle,
      },
      pathname: `/${quotePost.profile.relativeHandle}/${quotePost.id}`,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const currentQuote = within(await canvas.findByTestId('post-thread-current-post-quote'));

    expect(canvas.queryAllByTestId(/^post-thread-divider-/)).toHaveLength(0);
    expect(currentQuote.getAllByTestId('source-post-preview')).toHaveLength(1);
    expect(
      currentQuote.queryByRole('link', { name: `${repostAuthor.displayName}의 게시글 보기` }),
    ).not.toBeInTheDocument();
    expect(currentQuote.queryByTestId('post-timestamp')).not.toBeInTheDocument();
    expect(
      currentQuote
        .queryByText('이 원문에 덧붙이는 인용자의 본문입니다.')
        ?.closest(`a[href="/${quotePost.profile.relativeHandle}/${quotePost.id}"]`),
    ).toBeNull();

    await userEvent.click(
      currentQuote.getByRole('link', { name: `${sourceAuthor.displayName} 프로필 보기` }),
    );
    expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
      `/${sourceAuthor.relativeHandle}`,
    );

    await userEvent.click(currentQuote.getByRole('link', { name: '원문 게시글 보기' }));
    expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
      `/${sourceAuthor.relativeHandle}/${sourcePost.id}`,
    );

    await userEvent.click(currentQuote.getByTestId('source-post-body'));
    expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
      `/${sourceAuthor.relativeHandle}/${sourcePost.id}`,
    );
  },
  render: () => (
    <>
      <Text testID="current-story-pathname">{usePathname()}</Text>
      <PostDetailScreen />
    </>
  ),
};

export const PureRepostDetailCanonicalizesToSource: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailQuery: {
          data: {
            currentSession: null,
            node: {
              ...withReactionViewerState(pureRepost),
              reactionCounts: [],
              replyAncestors: [],
              replyDescendants: {
                edges: [],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      },
    },
    router: {
      params: {
        postId: pureRepost.id,
        profileHandle: pureRepost.profile.relativeHandle,
      },
      pathname: `/${pureRepost.profile.relativeHandle}/${pureRepost.id}`,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
        '/@source@remote.example/post-source',
      );
    });
    expect(canvas.queryByTestId('post-thread')).not.toBeInTheDocument();
  },
  render: () => (
    <>
      <Text testID="current-story-pathname">{usePathname()}</Text>
      <PostDetailScreen />
    </>
  ),
};

export const PostDetailThreadUnavailableAncestorBoundary: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    relay: {
      operationResponses: {
        PostDetailQuery: {
          data: {
            currentSession: null,
            node: {
              ...routeBoundaryCurrentPostWithoutReactions,
              replyAncestors: [routeVisibleParentPost],
              replyDescendants: { edges: [], pageInfo: { endCursor: null, hasNextPage: false } },
            },
          },
        },
      },
    },
    router: {
      params: {
        postId: routeBoundaryCurrentPost.id,
        profileHandle: routeBoundaryCurrentPost.profile.relativeHandle,
      },
      pathname: `/${routeBoundaryCurrentPost.profile.relativeHandle}/${routeBoundaryCurrentPost.id}`,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const thread = await canvas.findByTestId('post-thread');
    expect(Array.from(thread.children).map((row) => row.getAttribute('data-testid'))).toEqual([
      'post-thread-item-route-visible-parent',
      'post-thread-current-route-boundary-current',
    ]);
    const header = canvas.getByTestId('post-detail-scroll').children[0] as HTMLElement;
    const firstPost = thread.children[0] as HTMLElement;
    expect(header.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      firstPost.getBoundingClientRect().top,
    );
    expect(canvas.queryByText('숨겨진 답글')).not.toBeInTheDocument();
    expect(canvas.queryByText('조회할 수 없는 상위 Post')).not.toBeInTheDocument();
  },
  render: () => <PostDetailScreen />,
};

export const PostDetailReplyTargetedRefetch: Story = {
  parameters: {
    relay: {
      mutationResponse: {
        createPost: { post: { __typename: 'Post', id: routeCreatedReply.id } },
      },
      operationResponses: {
        PostDetailQuery: {
          sequence: [
            {
              data: {
                currentSession: {
                  __typename: 'Session',
                  id: 'session',
                  selectedProfile: composerProfile,
                },
                node: {
                  ...routeCurrentPostWithoutReactions,
                  replyAncestors: [],
                  replyDescendants: {
                    edges: [],
                    pageInfo: { endCursor: null, hasNextPage: false },
                  },
                },
              },
            },
            {
              data: {
                currentSession: {
                  __typename: 'Session',
                  id: 'session',
                  selectedProfile: composerProfile,
                },
                node: {
                  ...routeCurrentPostWithoutReactions,
                  replyAncestors: [],
                  replyDescendants: {
                    edges: [{ cursor: routeCreatedReply.id, node: routeCreatedReply }],
                    pageInfo: { endCursor: null, hasNextPage: false },
                  },
                },
              },
            },
          ],
        },
      },
    },
    router: {
      params: {
        postId: routeCurrentPost.id,
        profileHandle: routeCurrentPost.profile.relativeHandle,
      },
      pathname: `/${routeCurrentPost.profile.relativeHandle}/${routeCurrentPost.id}`,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('button', { name: '답글' });
    await userEvent.click(trigger);
    const body = await canvas.findByRole('textbox', { name: '답글 본문' });
    await userEvent.type(body, '현재 상세에 반영할 Reply');
    await userEvent.click(canvas.getByRole('button', { name: '답글 게시' }));

    await expect(canvas.findByText('targeted refetch로 반영된 새 Reply')).resolves.toBeVisible();
    expect(canvas.queryByRole('textbox', { name: '답글 본문' })).toBeNull();
    expect(canvas.getAllByRole('button', { name: '답글' })[0]).toHaveFocus();
  },
  render: () => <PostDetailScreen />,
};

export const PostDetailThreadShortContentAutoFills: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailQuery: {
          data: {
            currentSession: null,
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [],
              replyDescendants: {
                edges: [{ cursor: paginationInitialReply.id, node: paginationInitialReply }],
                pageInfo: { endCursor: paginationInitialReply.id, hasNextPage: true },
              },
            },
          },
        },
      },
      paginationResponses: [
        {
          data: {
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [],
              replyDescendants: {
                edges: [{ cursor: paginationFirstNextReply.id, node: paginationFirstNextReply }],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      ],
    },
    router: {
      params: {
        postId: routeCurrentPost.id,
        profileHandle: routeCurrentPost.profile.relativeHandle,
      },
      pathname: `/${routeCurrentPost.profile.relativeHandle}/${routeCurrentPost.id}`,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('첫 다음 page Reply')).resolves.toBeVisible();
  },
  render: () => <PostDetailScreen />,
};

export const PostDetailThreadDocumentScrollLoadsOnce: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailQuery: {
          data: {
            currentSession: null,
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [],
              replyDescendants: {
                edges: paginationInitialReplies.map((node) => ({ cursor: node.id, node })),
                pageInfo: {
                  endCursor: paginationInitialReplies.at(-1)?.id ?? null,
                  hasNextPage: true,
                },
              },
            },
          },
        },
      },
      paginationResponses: [
        {
          data: {
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [],
              replyDescendants: {
                edges: [{ cursor: paginationFirstNextReply.id, node: paginationFirstNextReply }],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
        {
          data: {
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [],
              replyDescendants: {
                edges: [
                  { cursor: paginationDuplicateNextReply.id, node: paginationDuplicateNextReply },
                ],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      ],
    },
    router: {
      params: {
        postId: routeCurrentPost.id,
        profileHandle: routeCurrentPost.profile.relativeHandle,
      },
      pathname: `/${routeCurrentPost.profile.relativeHandle}/${routeCurrentPost.id}`,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const storyWindow = canvasElement.ownerDocument.defaultView!;
    storyWindow.scrollTo(0, storyWindow.document.documentElement.scrollHeight);
    storyWindow.dispatchEvent(new Event('scroll'));
    storyWindow.dispatchEvent(new Event('scroll'));
    await expect(canvas.findByText('첫 다음 page Reply')).resolves.toBeVisible();
    expect(canvas.queryByText('중복 요청이면 나타나는 Reply')).not.toBeInTheDocument();
    storyWindow.dispatchEvent(new Event('scroll'));
    storyWindow.dispatchEvent(new Event('resize'));
    await waitFor(() => {
      expect(canvas.queryByText('중복 요청이면 나타나는 Reply')).not.toBeInTheDocument();
    });
  },
  render: () => <PostDetailScreen />,
};

export const PostDetailThreadPageLoading: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailQuery: {
          data: {
            currentSession: null,
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [],
              replyDescendants: {
                edges: paginationInitialReplies.map((node) => ({ cursor: node.id, node })),
                pageInfo: {
                  endCursor: paginationInitialReplies.at(-1)?.id ?? null,
                  hasNextPage: true,
                },
              },
            },
          },
        },
      },
      paginationLoading: true,
    },
    router: {
      params: {
        postId: routeCurrentPost.id,
        profileHandle: routeCurrentPost.profile.relativeHandle,
      },
      pathname: `/${routeCurrentPost.profile.relativeHandle}/${routeCurrentPost.id}`,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const storyWindow = canvasElement.ownerDocument.defaultView!;
    storyWindow.scrollTo(0, storyWindow.document.documentElement.scrollHeight);
    storyWindow.dispatchEvent(new Event('scroll'));
    const loadingText = await canvas.findByText('답글을 더 불러오는 중입니다.');
    expect(loadingText).toHaveAttribute('aria-live', 'polite');
    expect(canvas.getByText(/기존 Reply 20/)).toBeVisible();
  },
  render: () => <PostDetailScreen />,
};

export const PostDetailThreadPageFailureRetries: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailQuery: {
          data: {
            currentSession: null,
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [],
              replyDescendants: {
                edges: paginationInitialReplies.map((node) => ({ cursor: node.id, node })),
                pageInfo: {
                  endCursor: paginationInitialReplies.at(-1)?.id ?? null,
                  hasNextPage: true,
                },
              },
            },
          },
        },
      },
      paginationResponses: [
        { error: '다음 Reply page를 불러오지 못했습니다.' },
        {
          data: {
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [],
              replyDescendants: {
                edges: [{ cursor: paginationRetryReply.id, node: paginationRetryReply }],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      ],
    },
    router: {
      params: {
        postId: routeCurrentPost.id,
        profileHandle: routeCurrentPost.profile.relativeHandle,
      },
      pathname: `/${routeCurrentPost.profile.relativeHandle}/${routeCurrentPost.id}`,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const storyWindow = canvasElement.ownerDocument.defaultView!;
    storyWindow.scrollTo(0, storyWindow.document.documentElement.scrollHeight);
    storyWindow.dispatchEvent(new Event('scroll'));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '답글을 더 불러오지 못했어요',
    );
    expect(canvas.getByText(/기존 Reply 20/)).toBeVisible();
    const retryButton = canvas.getByRole('button', { name: '답글 다시 불러오기' });
    expect(retryButton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.click(retryButton);
    await expect(canvas.findByText('재시도로 추가된 Reply')).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
  render: () => <PostDetailScreen />,
};

function PostDetailThreadIdentityFailureStory() {
  const [identity, setIdentity] = useState('actor-a:0');
  const data = useLazyLoadQuery<PostDetailThreadIdentityStoryQuery>(
    PostDetailThreadIdentityStoryQuery,
    { postId: routeCurrentPost.id },
  );
  const post = data.node?.__typename === 'Post' ? data.node.thread : null;

  if (!post) {
    throw new Error('Missing Post detail thread identity story fixture.');
  }

  const threadProps = { header: <Text>게시글</Text>, identity, post };

  return (
    <>
      <Pressable
        accessibilityLabel="다른 actor query로 전환"
        accessibilityRole="button"
        onPress={() => setIdentity('actor-b:0')}
      >
        <Text>다른 actor query로 전환</Text>
      </Pressable>
      <PostDetailThread {...threadProps} />
    </>
  );
}

function PostDetailThreadReplyOwnerStory() {
  const data = useLazyLoadQuery<PostDetailThreadIdentityStoryQuery>(
    PostDetailThreadIdentityStoryQuery,
    { postId: routeCurrentPost.id },
  );
  const replyProfile = usePostsStoryData().replyComposerProfile;
  const post = data.node?.__typename === 'Post' ? data.node.thread : null;

  if (!post) {
    throw new Error('Missing Post detail thread Reply owner story fixture.');
  }

  return (
    <PostDetailThread
      header={<Text>게시글</Text>}
      identity="reply-owner:0"
      post={post}
      replyProfile={replyProfile}
    />
  );
}

export const PostDetailThreadPageFailureIdentityReset: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailThreadIdentityStoryQuery: {
          data: {
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [],
              replyDescendants: {
                edges: paginationInitialReplies.map((node) => ({ cursor: node.id, node })),
                pageInfo: {
                  endCursor: paginationInitialReplies.at(-1)?.id ?? null,
                  hasNextPage: true,
                },
              },
            },
          },
        },
      },
      paginationResponses: [{ error: '다음 Reply page를 불러오지 못했습니다.' }],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const storyWindow = canvasElement.ownerDocument.defaultView!;
    storyWindow.scrollTo(0, storyWindow.document.documentElement.scrollHeight);
    storyWindow.dispatchEvent(new Event('scroll'));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '답글을 더 불러오지 못했어요',
    );
    await userEvent.click(canvas.getByRole('button', { name: '다른 actor query로 전환' }));
    await waitFor(() => {
      expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    });
  },
  render: () => <PostDetailThreadIdentityFailureStory />,
};

export const PostDetailThreadReplyOwnerIntegration: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailThreadIdentityStoryQuery: {
          data: {
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [routeVisibleParentPost],
              replyDescendants: {
                edges: [{ cursor: routeChildPost.id, node: routeChildPost }],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const replyButtons = canvas.getAllByRole('button', { name: '답글' });
    expect(replyButtons).toHaveLength(3);

    await userEvent.click(replyButtons[0]!);
    expect(canvas.getAllByRole('textbox', { name: '답글 본문' })).toHaveLength(1);
    expect(
      replyButtons.filter((button) => button.getAttribute('aria-expanded') === 'true'),
    ).toEqual([replyButtons[0]]);

    const body = canvas.getByRole('textbox', { name: '답글 본문' });
    await userEvent.type(body, '첫 Parent draft');
    await userEvent.click(replyButtons[1]!);
    const confirm = await screen.findByRole('alertdialog', {
      name: '답글 작성을 취소할까요?',
    });
    expect(body).toHaveValue('첫 Parent draft');
    expect(
      replyButtons.filter((button) => button.getAttribute('aria-expanded') === 'true'),
    ).toEqual([replyButtons[0]]);

    const continueButton = within(confirm).getByRole('button', { name: '계속 작성' });
    const discardButton = within(confirm).getByRole('button', { name: '작성 취소' });
    await waitFor(() => expect(continueButton).toHaveFocus());
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(discardButton).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    expect(continueButton).toHaveFocus();
    await userEvent.click(continueButton);
    expect(screen.queryByRole('alertdialog', { name: '답글 작성을 취소할까요?' })).toBeNull();
    expect(body).toHaveValue('첫 Parent draft');
    expect(body).toHaveFocus();

    await userEvent.click(replyButtons[1]!);
    await userEvent.click(
      within(await screen.findByRole('alertdialog', { name: '답글 작성을 취소할까요?' })).getByRole(
        'button',
        { name: '작성 취소' },
      ),
    );
    await waitFor(() => expect(canvas.getByRole('textbox', { name: '답글 본문' })).toHaveValue(''));
    expect(
      replyButtons.filter((button) => button.getAttribute('aria-expanded') === 'true'),
    ).toEqual([replyButtons[1]]);

    await userEvent.click(replyButtons[1]!);
    await waitFor(() => expect(canvas.queryByRole('textbox', { name: '답글 본문' })).toBeNull());
    expect(replyButtons[1]).toHaveFocus();
  },
  render: () => <PostDetailThreadReplyOwnerStory />,
};

export const ComposerDefault: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    expect(body).not.toHaveAttribute('maxlength');
    await userEvent.click(body);
    expect(body).toHaveFocus();
    expect(getComputedStyle(body).outlineStyle).not.toBe('none');
  },
  render: () => <ComposerStory />,
};

export const ComposerMediaStates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByLabelText('첨부 이미지 1, 업로드 중')).toHaveStyle({
      borderWidth: '0px',
    });
    expect(canvas.getByRole('progressbar', { name: '첨부 이미지 1 업로드 중' })).toBeVisible();
    expect(canvas.queryByText('업로드 중…')).not.toBeInTheDocument();
    expect(canvas.getByLabelText('첨부 이미지 2, 업로드 완료')).toBeVisible();
    expect(canvas.getByLabelText('첨부 이미지 3, 업로드 실패')).toBeVisible();
    expect(canvas.getByRole('button', { name: '첨부 이미지 1 제거' })).toBeVisible();
    expect(canvas.getByRole('textbox', { name: '첨부 이미지 2 대체 텍스트' })).toHaveValue(
      '회색 이미지의 대체 텍스트',
    );
    expect(canvas.getByRole('switch', { name: '민감한 이미지로 표시' })).toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 3 업로드 재시도' }));
    expect(canvas.getByLabelText('첨부 이미지 3, 업로드 중')).toBeVisible();
  },
  render: () => <ComposerMediaStatesStory />,
};

export const ComposerMediaUploadInteraction: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostComposerCompleteMediaUploadMutation: {
          sequence: [1, 2, 3, 4].map((index) => ({
            data: { completeMediaUpload: { media: { id: `media-${index}`, state: 'READY' } } },
          })),
        },
        PostComposerIssueMediaUploadUrlMutation: {
          sequence: [1, 2, 3, 4].map((index) => ({
            data: {
              issueMediaUploadUrl: {
                media: { id: `media-${index}` },
                uploadUrl: `https://upload.example/${index}`,
              },
            },
          })),
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const originalFetch = globalThis.fetch;
    const upload = fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = upload;

    let finishSelection!: (result: {
      assets: (typeof composerMediaAsset)[];
      canceled: false;
    }) => void;
    setNextImagePickerResult(
      new Promise((resolve) => {
        finishSelection = resolve;
      }),
    );

    try {
      const add = canvas.getByRole('button', { name: '이미지 추가, 4개 더 선택 가능' });
      expect(canvas.queryByText('이미지 추가')).not.toBeInTheDocument();
      expect(add).toHaveStyle({ height: '40px', width: '40px' });
      await userEvent.click(add);
      await userEvent.click(add);
      expect(getImagePickerLaunchCount()).toBe(1);

      finishSelection({
        assets: [1, 2, 3, 4, 5].map((index) => ({
          ...composerMediaAsset,
          file: new File([`image-${index}`], `image-${index}.png`, { type: 'image/png' }),
          mimeType: 'image/png',
          uri: `blob:https://kosmo.example/${index}`,
        })),
        canceled: false,
      });

      await waitFor(() => {
        expect(canvas.getByLabelText('첨부 이미지 4, 업로드 완료')).toBeVisible();
      });
      expect(canvas.getByRole('button', { name: '이미지 추가, 0개 더 선택 가능' })).toBeDisabled();
      expect(upload).toHaveBeenCalledTimes(4);

      await userEvent.type(
        canvas.getByRole('textbox', { name: '첨부 이미지 1 대체 텍스트' }),
        '첫 번째 이미지',
      );
      await userEvent.click(canvas.getByRole('switch', { name: '민감한 이미지로 표시' }));
      await userEvent.click(canvas.getByRole('button', { name: '게시' }));

      await waitFor(() => {
        expect(canvas.queryByLabelText('첨부 이미지 1, 업로드 완료')).not.toBeInTheDocument();
      });
      expect(
        canvas.queryByRole('switch', { name: '민감한 이미지로 표시' }),
      ).not.toBeInTheDocument();
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
  render: () => <ComposerStory />,
};

export const ComposerPickerResultAfterUnmount: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostComposerCompleteMediaUploadMutation: {
          data: { completeMediaUpload: { media: { id: 'media-after-unmount', state: 'READY' } } },
        },
        PostComposerIssueMediaUploadUrlMutation: {
          data: {
            issueMediaUploadUrl: {
              media: { id: 'media-after-unmount' },
              uploadUrl: 'https://upload.example/after-unmount',
            },
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const originalFetch = globalThis.fetch;
    const upload = fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = upload;

    let finishSelection!: (result: {
      assets: (typeof composerMediaAsset)[];
      canceled: false;
    }) => void;
    setNextImagePickerResult(
      new Promise((resolve) => {
        finishSelection = resolve;
      }),
    );

    try {
      await userEvent.click(canvas.getByRole('button', { name: '이미지 추가, 4개 더 선택 가능' }));
      await userEvent.click(canvas.getByRole('button', { name: 'Composer 닫기' }));

      finishSelection({ assets: [composerMediaAsset], canceled: false });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(getImagePickerLaunchCount()).toBe(1);
      expect(upload).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
  render: () => <ComposerPickerUnmountStory />,
};

export const ComposerSubmitting: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: '게시글 본문' }), '제출 중 상태');
    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    await expect(canvas.getByRole('button', { name: '게시' })).toBeDisabled();
    await expect(canvas.findByLabelText('게시 처리 중')).resolves.toBeVisible();
  },
  render: () => <ComposerStory />,
};

export const ComposerVisibilityAndSubmitInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    await userEvent.type(body, '스토리에서 작성한 게시글입니다.');
    await userEvent.click(canvas.getByRole('button', { name: '조용한 공개' }));

    let menu = await canvas.findByRole('menu', { name: '게시글 공개 설정' });
    expect(menu).toBeVisible();
    await userEvent.click(body);
    await waitFor(() => {
      expect(canvas.queryByRole('menu', { name: '게시글 공개 설정' })).not.toBeInTheDocument();
    });

    await userEvent.click(canvas.getByRole('button', { name: '조용한 공개' }));
    menu = await canvas.findByRole('menu', { name: '게시글 공개 설정' });
    expect(
      within(menu).queryByRole('menuitemradio', { name: /^언급한 계정만/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /^공개/ }));
    await waitFor(() => {
      expect(canvas.queryByRole('menu', { name: '게시글 공개 설정' })).not.toBeInTheDocument();
    });
    await expect(canvas.getByRole('button', { name: '공개' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    await expect(body).toHaveValue('');
    expect(trackAnalytics).toHaveBeenCalledOnce();
    expect(trackAnalytics).toHaveBeenCalledWith('post_created', {
      selected_profile_id: composerProfile.id,
      visibility: 'PUBLIC',
    });
  },
  render: () => <ComposerStory />,
};

export const ComposerErrorInteraction: Story = {
  parameters: { relay: { mutationError: '게시글 작성 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '게시글 본문' }),
      '오류 상태를 확인합니다.',
    );
    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('게시글 작성 실패');
    expect(canvas.getByRole('textbox', { name: '게시글 본문' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(trackAnalytics).not.toHaveBeenCalled();
  },
  render: () => <ComposerStory />,
};

export const ComposerGraphQLErrorPreservesInput: Story = {
  parameters: {
    relay: {
      mutationGraphQLErrors: ['본문 형식이 올바르지 않습니다.'],
      mutationResponse: { createPost: { post: { id: 'post-rejected-in-story' } } },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    await userEvent.type(body, '오류가 나도 보존할 본문입니다.');
    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '게시글을 작성하지 못했습니다.',
    );
    expect(body).toHaveValue('오류가 나도 보존할 본문입니다.');
  },
  render: () => <ComposerStory />,
};

export const ComposerReplyGraphQLErrorPreservesInput: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: {
    relay: {
      mutationGraphQLErrors: ['본문 형식이 올바르지 않습니다.'],
      mutationResponse: { createPost: { post: { id: 'reply-rejected-in-story' } } },
    },
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    const body = within(dialog).getByRole('textbox', { name: '답글 본문' });
    await userEvent.type(body, '오류가 나도 보존할 답글입니다.');
    await userEvent.click(within(dialog).getByRole('button', { name: '답글 게시' }));
    await expect(within(dialog).findByRole('alert')).resolves.toHaveTextContent(
      '답글을 작성하지 못했습니다.',
    );
    expect(body).toHaveValue('오류가 나도 보존할 답글입니다.');
  },
  render: () => <ReplyModalPresentationStory />,
};

export const ComposerReplyMutationContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '답글 본문' });

    await userEvent.click(canvas.getByRole('button', { name: '조용한 공개' }));
    const menu = await canvas.findByRole('menu', { name: '답글 공개 설정' });
    expect(within(menu).queryByRole('menuitemradio', { name: /언급한 계정만/ })).toBeNull();
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /^팔로워만/ }));
    await userEvent.type(body, '부모 게시물에 작성한 답글입니다.');
    await userEvent.click(canvas.getByRole('button', { name: '답글 게시' }));

    await waitFor(() => {
      expect(canvas.getByTestId('reply-composer-request-log')).toHaveTextContent(
        JSON.stringify([
          {
            bodyText: '부모 게시물에 작성한 답글입니다.',
            replyParentId: 'post-parent',
            visibility: 'FOLLOWERS',
          },
        ]),
      );
      expect(canvas.getByTestId('reply-composer-created-log')).toHaveTextContent(
        JSON.stringify(['reply-created-in-story']),
      );
    });
    expect(body).toHaveValue('');
  },
  render: () => <ReplyComposerContractStory />,
};

export const ComposerReplyContextIsolation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '답글 본문' });

    await userEvent.type(body, '이전 Parent의 늦은 답글');
    await userEvent.click(canvas.getByRole('button', { name: '답글 게시' }));
    await userEvent.click(canvas.getByRole('button', { name: '다른 Parent로 전환' }));

    await waitFor(() =>
      expect(canvas.getByTestId('reply-context-first-committed-body')).toHaveTextContent('""'),
    );
    const currentBody = canvas.getByRole('textbox', { name: '답글 본문' });
    expect(currentBody).toHaveValue('');
    await userEvent.type(currentBody, '새 Parent의 답글');
    expect(canvas.getByRole('button', { name: '답글 게시' })).toBeEnabled();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(currentBody).toHaveValue('새 Parent의 답글');
    expect(canvas.getByTestId('reply-context-created-log')).toHaveTextContent('[]');
  },
  render: () => <ReplyComposerContextIsolationStory />,
};

export const ComposerReplyEnvironmentIsolation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const oldBody = await screen.findByRole('textbox', { name: '답글 본문' });

    await userEvent.type(oldBody, '이전 Environment의 늦은 답글');
    await userEvent.click(screen.getByRole('button', { name: '답글 게시' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Relay Environment 교체' }));

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(canvas.getByTestId('reply-environment-created-log')).toHaveTextContent('[]');
    expect(canvas.getByTestId('reply-environment-close-log')).toHaveTextContent('0');
    const currentBody = await screen.findByRole('textbox', { name: '답글 본문' });
    await waitFor(() =>
      expect(canvas.getByTestId('reply-environment-first-committed-state')).toHaveTextContent(
        JSON.stringify({ body: '', closeDisabled: false }),
      ),
    );
    expect(currentBody).toHaveValue('');
    await userEvent.type(currentBody, '새 Environment의 답글');
    expect(currentBody).toHaveValue('새 Environment의 답글');
    expect(canvas.getByTestId('reply-environment-created-log')).toHaveTextContent('[]');
  },
  render: () => <ReplyComposerEnvironmentIsolationStory />,
};

export const ReplyModalPresentation: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });

    expect(within(dialog).getByRole('heading', { name: '답글 쓰기' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: '닫기' })).toBeVisible();
    expect(within(dialog).getByText('짧은 본문 한 줄.')).toBeVisible();
    const initialBody = within(dialog).getByRole('textbox', { name: '답글 본문' });
    expect(initialBody).toBeVisible();
    expect(initialBody).toHaveAccessibleDescription('남은 글자 수 500자');
    expect(within(dialog).getByRole('button', { name: '조용한 공개' })).toBeVisible();
    expect(within(dialog).getByText('500')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: '답글 게시' })).toBeDisabled();
    expect(within(dialog).queryByRole('toolbar', { name: '액션 바' })).toBeNull();
    expect(within(dialog).getAllByTestId('reply-composer-scroll')).toHaveLength(1);
    expect(getComputedStyle(within(dialog).getByTestId('reply-parent')).borderBottomWidth).toBe(
      '0px',
    );
    const connector = within(dialog).getByTestId('reply-parent-thread-connector');
    const [parentAvatar, composerAvatar] = within(dialog).getAllByLabelText(/프로필 이미지$/);
    const connectorBounds = connector.getBoundingClientRect();
    const parentAvatarBounds = parentAvatar!.getBoundingClientRect();
    const composerAvatarBounds = composerAvatar!.getBoundingClientRect();
    expect(getComputedStyle(connector).width).toBe('2px');
    expect(
      Math.abs(
        connectorBounds.left +
          connectorBounds.width / 2 -
          (parentAvatarBounds.left + parentAvatarBounds.width / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        connectorBounds.left +
          connectorBounds.width / 2 -
          (composerAvatarBounds.left + composerAvatarBounds.width / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(connectorBounds.top).toBeGreaterThanOrEqual(parentAvatarBounds.bottom);
    expect(connectorBounds.bottom).toBeLessThanOrEqual(composerAvatarBounds.top);
    expect(connectorBounds.height).toBeGreaterThan(0);
    const modalSurface = within(dialog).getByTestId('reply-composer-dialog-surface');
    expect(modalSurface.getBoundingClientRect().width).toBe(600);
    expect(modalSurface.getBoundingClientRect().height).toBe(720);

    const visibilityButton = within(dialog).getByRole('button', { name: '조용한 공개' });
    await userEvent.click(visibilityButton);
    const visibilityMenu = await within(dialog).findByRole('menu', { name: '답글 공개 설정' });
    expect(visibilityMenu).toBeVisible();
    const visibilityButtonBounds = visibilityButton.getBoundingClientRect();
    const visibilityMenuBounds = visibilityMenu.getBoundingClientRect();
    expect(visibilityMenuBounds.bottom).toBeLessThanOrEqual(visibilityButtonBounds.top);
    expect(visibilityMenuBounds.top).toBeGreaterThanOrEqual(
      modalSurface.getBoundingClientRect().top,
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(within(dialog).queryByRole('menu', { name: '답글 공개 설정' })).toBeNull();
    });
    expect(dialog).toBeVisible();
    expect(screen.queryByRole('alertdialog', { name: '답글 작성을 취소할까요?' })).toBeNull();
    expect(visibilityButton).toHaveFocus();

    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '답글 쓰기' })).toBeNull());
    expect(canvas.getByTestId('reply-modal-open-state')).toHaveTextContent('closed');

    const reopen = canvas.getByRole('button', { name: 'Reply modal 다시 열기' });
    await userEvent.click(reopen);
    const reopenedDialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    const body = within(reopenedDialog).getByRole('textbox', { name: '답글 본문' });
    await userEvent.type(body, '작성 중인 답글');
    await userEvent.click(within(reopenedDialog).getByRole('button', { name: '닫기' }));

    const confirm = await screen.findByRole('alertdialog', {
      name: '답글 작성을 취소할까요?',
    });
    expect(body).toHaveValue('작성 중인 답글');
    const continueButton = within(confirm).getByRole('button', { name: '계속 작성' });
    const discardButton = within(confirm).getByRole('button', { name: '작성 취소' });
    await waitFor(() => expect(continueButton).toHaveFocus());
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(discardButton).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    expect(continueButton).toHaveFocus();
    await userEvent.click(continueButton);
    expect(screen.queryByRole('alertdialog', { name: '답글 작성을 취소할까요?' })).toBeNull();
    expect(body).toHaveValue('작성 중인 답글');
    expect(body).toHaveFocus();

    await userEvent.click(within(reopenedDialog).getByRole('button', { name: '닫기' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog', { name: '답글 작성을 취소할까요?' })).getByRole(
        'button',
        { name: '작성 취소' },
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '답글 쓰기' })).toBeNull());
    expect(reopen).toHaveFocus();
  },
  render: () => <ReplyModalPresentationStory />,
};

export const ReplyModalResponsiveFocusLifecycle: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  play: async ({ canvasElement }) => {
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Reply modal responsive story requires a browser window.');
    }

    const visualViewport = storyWindow.visualViewport;
    if (!visualViewport) {
      throw new Error('Reply modal responsive story requires visualViewport.');
    }
    const originalWidthDescriptor = Object.getOwnPropertyDescriptor(visualViewport, 'width');
    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    const body = within(dialog).getByRole('textbox', { name: '답글 본문' });
    const surface = within(dialog).getByTestId('reply-composer-dialog-surface');
    await waitFor(() => expect(body).toHaveFocus());

    try {
      Object.defineProperty(visualViewport, 'width', { configurable: true, value: 767 });
      visualViewport.dispatchEvent(new Event('resize'));
      await waitFor(() => expect(getComputedStyle(surface).borderRadius).toBe('0px'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(body).toHaveFocus();
    } finally {
      if (originalWidthDescriptor) {
        Object.defineProperty(visualViewport, 'width', originalWidthDescriptor);
      } else {
        Reflect.deleteProperty(visualViewport, 'width');
      }
      visualViewport.dispatchEvent(new Event('resize'));
    }
  },
  render: () => <ReplyModalPresentationStory />,
};

export const ReplyListSurfaceIntegration: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const replyButtons = canvas.getAllByRole('button', { name: '답글' });

    expect(replyButtons[0]).toBeEnabled();
    expect(replyButtons.some((button) => button.hasAttribute('disabled'))).toBe(true);
    await userEvent.click(replyButtons[0]!);

    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    expect(within(dialog).getByText('짧은 본문 한 줄.')).toBeVisible();
    expect(replyButtons[0]).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '답글 쓰기' })).toBeNull());
    expect(replyButtons[0]).toHaveFocus();
    expect(replyButtons[0]).toHaveAttribute('aria-expanded', 'false');
  },
  render: () => <ReplyListSurfaceStory />,
};

export const ReplyDetailInlineIntegration: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const replyButton = canvas.getByRole('button', { name: '답글' });

    await userEvent.click(replyButton);
    expect(screen.queryByRole('dialog', { name: '답글 쓰기' })).toBeNull();
    const body = canvas.getByRole('textbox', { name: '답글 본문' });
    expect(body).toBeVisible();
    await waitFor(() => expect(body).toHaveFocus());
    expect(getComputedStyle(body).outlineStyle).toBe('none');
    const editorSurface = body.parentElement?.parentElement;
    expect(editorSurface).not.toBeNull();
    const editorStyle = getComputedStyle(editorSurface!);
    expect(
      getColorContrastRatio(editorStyle.borderColor, editorStyle.backgroundColor),
    ).toBeGreaterThanOrEqual(3);
    expect(getColorContrastRatio(colors.dark.focus, colors.dark.background)).toBeGreaterThanOrEqual(
      3,
    );
    expect(replyButton).toHaveAttribute('aria-expanded', 'true');
    expect(canvas.getAllByText('짧은 본문 한 줄.')).toHaveLength(1);

    await userEvent.click(replyButton);
    await waitFor(() => expect(canvas.queryByRole('textbox', { name: '답글 본문' })).toBeNull());
    expect(replyButton).toHaveAttribute('aria-expanded', 'false');
  },
  render: () => <ReplyDetailInlineStory />,
};

export const ReplyModalPendingLifecycle: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    const body = within(dialog).getByRole('textbox', { name: '답글 본문' });
    await userEvent.type(body, '제출 중인 답글');
    await userEvent.click(within(dialog).getByRole('button', { name: '답글 게시' }));

    expect(within(dialog).getByRole('button', { name: '게시 중' })).toBeDisabled();
    expect(within(dialog).getByLabelText('게시 중 처리 중')).toBeVisible();
    expect(body).toHaveAttribute('readonly');
    expect(within(dialog).getByRole('button', { name: '조용한 공개' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '닫기' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '답글 쓰기' })).toBeVisible();
    expect(screen.queryByRole('alertdialog', { name: '답글 작성을 취소할까요?' })).toBeNull();
    expect(canvasElement.ownerDocument.body.style.overflow).toBe('hidden');
  },
  render: () => <ReplyModalPresentationStory />,
};

export const ReplyDetailInlinePendingLifecycle: Story = {
  parameters: {
    relay: {
      mutationLoading: true,
      operationResponses: {
        PostDetailThreadIdentityStoryQuery: {
          data: {
            node: {
              ...routeCurrentPostWithoutReactions,
              replyAncestors: [routeVisibleParentPost],
              replyDescendants: {
                edges: [{ cursor: routeChildPost.id, node: routeChildPost }],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const replyButtons = canvas.getAllByRole('button', { name: '답글' });
    await userEvent.click(replyButtons[0]!);
    const body = canvas.getByRole('textbox', { name: '답글 본문' });
    await userEvent.type(body, '제출 중인 인라인 답글');
    await userEvent.click(canvas.getByRole('button', { name: '답글 게시' }));

    expect(canvas.getByRole('button', { name: '게시 중' })).toBeDisabled();
    expect(canvas.getByLabelText('게시 중 처리 중')).toBeVisible();
    await userEvent.click(replyButtons[1]!);
    expect(body).toHaveValue('제출 중인 인라인 답글');
    expect(
      replyButtons.filter((button) => button.getAttribute('aria-expanded') === 'true'),
    ).toEqual([replyButtons[0]]);

    await userEvent.click(replyButtons[0]!);
    expect(canvas.getByRole('textbox', { name: '답글 본문' })).toBe(body);
    expect(screen.queryByRole('alertdialog', { name: '답글 작성을 취소할까요?' })).toBeNull();
  },
  render: () => <PostDetailThreadReplyOwnerStory />,
};

export const ReplyModalFailureLifecycle: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: { relay: { mutationError: '답글 전송 네트워크 오류' } },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    const body = within(dialog).getByRole('textbox', { name: '답글 본문' });
    await userEvent.type(body, '실패 뒤 유지할 답글');
    await userEvent.click(within(dialog).getByRole('button', { name: '답글 게시' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('답글 전송 네트워크 오류');
    expect(within(dialog).getByText('짧은 본문 한 줄.')).toBeVisible();
    expect(body).toHaveValue('실패 뒤 유지할 답글');
    expect(within(dialog).getByRole('button', { name: '답글 게시' })).toBeEnabled();
  },
  render: () => <ReplyModalPresentationStory />,
};

export const ReplyListSurfaceSuccessLifecycle: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: {
    relay: {
      mutationResponse: {
        createPost: { post: { __typename: 'Post', id: 'reply-created-from-list' } },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getAllByRole('button', { name: '답글' })[0]!;
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: '답글 본문' }),
      '목록에서 작성한 답글',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: '답글 게시' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '답글 쓰기' })).toBeNull());
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const success = await screen.findByRole('alert');
    expect(success).toHaveTextContent('답글을 게시했어요');
    expect(canvas.getByTestId('reply-success-pathname')).toHaveTextContent('/@kosmo/post-1');
    await userEvent.click(within(success).getByRole('button', { name: '보기' }));
    await waitFor(() => {
      expect(canvas.getByTestId('reply-success-pathname')).toHaveTextContent(
        '/@kosmo/reply-created-from-list',
      );
    });
  },
  render: () => <ReplyListSurfaceStory />,
};

export const ReplyFullscreenPresentation: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async ({ canvasElement }) => {
    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    const surface = within(dialog).getByTestId('reply-composer-dialog-surface');
    const bounds = surface.getBoundingClientRect();
    const documentElement = canvasElement.ownerDocument.documentElement;

    expect(bounds.width).toBe(documentElement.clientWidth);
    expect(bounds.height).toBe(documentElement.clientHeight);
    expect(getComputedStyle(surface).borderRadius).toBe('0px');
  },
  render: () => <ReplyModalPresentationStory />,
};

export const ReplyQuoteParentPresentation: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: '답글 쓰기' });
    expect(within(dialog).getByTestId('reply-parent')).toHaveTextContent('안전한 외부 링크');
    expect(within(dialog).queryByRole('link')).toBeNull();
    const source = within(dialog).getByTestId('source-post-preview');
    expect(source).toBeVisible();
    expect(within(source).getByTestId('source-post-body')).toHaveTextContent('안전한 외부 링크');
    expect(within(source).queryByRole('link')).toBeNull();
    expect(getComputedStyle(source).borderStyle).toBe('solid');
  },
  render: () => <ReplyModalPresentationStory parentId={linkedSourceQuote.id} />,
};
