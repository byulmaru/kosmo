import { usePathname } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Temporal } from 'temporal-polyfill';
import PostDetailScreen from '@/app/(tabs)/(post)/[profileHandle]/[postId]';
import { PostBody } from '@/components/post/PostBody';
import { PostComposer } from '@/components/post/PostComposer';
import { PostDetailThread } from '@/components/post/PostDetailThread';
import { PostLayout } from '@/components/post/PostLayout';
import { PostList } from '@/components/post/PostList';
import { PostListItem } from '@/components/post/PostListItem';
import { PostSourcePresentationView } from '@/components/post/PostSourcePresentationView';
import { PostThreadLayout } from '@/components/post/PostThreadLayout';
import { formatTimelineTimestamp } from '@/lib/date';
import { spacing, typography } from '@/theme/tokens';
import { longBody, post, profile, profileWithPosts, timeline } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  PostPresentationLinkRenderer,
  PostSourcePresentationData,
} from '@/components/post/PostSourcePresentationView';
import type { PostDetailThreadIdentityStoryQuery } from './__generated__/PostDetailThreadIdentityStoryQuery.graphql';
import type { PostsStoriesQuery as PostsStoriesQueryType } from './__generated__/PostsStoriesQuery.graphql';
import type { StoryPost } from './fixtures';

const shortPost = post({ bodyText: '짧은 본문 한 줄.', id: 'short' });
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
const sourcePost = post({
  bodyText: '원문 작성자의 긴 본문과 줄바꿈을 표시합니다.\n두 번째 줄입니다.',
  id: 'post-source',
  profile: sourceAuthor,
});
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
const pureRepost = post({
  bodyText: null,
  id: 'post-repost',
  profile: repostAuthor,
  repostSource: sourcePost,
});
const quotePost = post({
  bodyText: '이 원문에 덧붙이는 인용자의 본문입니다.',
  id: 'post-quote',
  profile: repostAuthor,
  repostSource: sourcePost,
});
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
const routeRootPost = post({ bodyText: 'Route Root 본문', id: 'route-root' });
const routeParentPost = post({
  bodyText: 'Route Parent 본문',
  id: 'route-parent',
  replyParent: { __typename: 'Post', id: routeRootPost.id },
});
const routeSourcePost = post({ bodyText: 'Source 본문', id: 'route-source' });
const routeCurrentPost = post({
  bodyText: '현재 Reply 본문',
  id: 'route-current',
  replyParent: { __typename: 'Post', id: routeParentPost.id },
});
const routeCurrentPostReactionCounts = [{ count: 2, type: '❤️' }];
const routeCurrentPostWithoutReactions = { ...routeCurrentPost, reactionCounts: [] };
const routeChildPost = post({
  bodyText: 'Child 본문',
  id: 'route-child',
  replyParent: { __typename: 'Post', id: routeCurrentPost.id },
});
const routeSiblingPost = post({
  bodyText: 'Sibling 본문',
  id: 'route-sibling',
  replyParent: { __typename: 'Post', id: routeParentPost.id },
});
const routeReplyQuotePost = post({
  bodyText: 'Reply+Quote 자체 Content',
  id: 'route-reply-quote',
  replyParent: { __typename: 'Post', id: routeSiblingPost.id },
  repostSource: routeSourcePost,
});
const routeSourceNullPost = post({
  bodyText: 'Source가 없어도 남는 Content',
  id: 'route-source-null',
  replyParent: { __typename: 'Post', id: routeSiblingPost.id },
});
const routeHiddenAncestorPost = post({
  bodyText: '숨겨진 답글',
  id: 'route-hidden-ancestor',
});
const routeVisibleParentPost = post({
  bodyText: '조회 가능한 직접 Parent',
  id: 'route-visible-parent',
  replyParent: { __typename: 'Post', id: routeHiddenAncestorPost.id },
});
const routeBoundaryCurrentPost = post({
  bodyText: '경계 Current 본문',
  id: 'route-boundary-current',
  replyParent: { __typename: 'Post', id: routeVisibleParentPost.id },
});
const routeBoundaryCurrentPostWithoutReactions = {
  ...routeBoundaryCurrentPost,
  reactionCounts: [],
};
const paginationInitialReplies = Array.from({ length: 20 }, (_, index) =>
  post({
    bodyText: `기존 Reply ${index + 1}\n${Array.from({ length: 8 }, () => '긴 document scroll 검증 본문').join('\n')}`,
    id: `pagination-initial-${index + 1}`,
    replyParent: { __typename: 'Post', id: routeCurrentPost.id },
  }),
);
const paginationInitialReply = post({
  bodyText: '짧은 화면의 초기 Reply',
  id: 'pagination-short-initial',
  replyParent: { __typename: 'Post', id: routeCurrentPost.id },
});
const paginationFirstNextReply = post({
  bodyText: '첫 다음 page Reply',
  id: 'pagination-next-first',
  replyParent: { __typename: 'Post', id: routeCurrentPost.id },
});
const paginationDuplicateNextReply = post({
  bodyText: '중복 요청이면 나타나는 Reply',
  id: 'pagination-next-duplicate',
  replyParent: { __typename: 'Post', id: routeCurrentPost.id },
});
const paginationRetryReply = post({
  bodyText: '재시도로 추가된 Reply',
  id: 'pagination-next-retry',
  replyParent: { __typename: 'Post', id: routeCurrentPost.id },
});
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
  deepestSourcePost,
  sourceQuotePost,
  pureRepostOfQuote,
  quoteOfQuotePost,
];
const composerProfile = profile({ id: 'profile-composer' });
const emptyPostsProfile = profileWithPosts([], { id: 'profile-posts-empty' });
const contentPostsProfile = profileWithPosts(
  [shortPost, pureRepostOfQuote, quotePost, quoteWithoutSource],
  { id: 'profile-posts-content' },
);
const homeTimeline = timeline(
  shortPost,
  pureRepost,
  quotePost,
  replyQuotePost,
  quoteOfQuotePost,
  linkedSourceQuote,
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
      }
    }
    composerProfile: node(id: "profile-composer") {
      __typename
      ... on Profile {
        id
        ...PostComposer_profile @alias(as: "composer")
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
  onPostAuthor?: ReturnType<typeof fn>;
  onPostDetail?: ReturnType<typeof fn>;
  onRetry?: ReturnType<typeof fn>;
  onSourceAuthor?: ReturnType<typeof fn>;
  onSourcePost?: ReturnType<typeof fn>;
};

type PresentationCallbacks = {
  postAuthor: ReturnType<typeof fn>;
  postDetail: ReturnType<typeof fn>;
  sourceAuthor: ReturnType<typeof fn>;
  sourcePost: ReturnType<typeof fn>;
};

type PresentationStoryProps = {
  callbacks: PresentationCallbacks;
  postId: string;
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
    data.composerProfile?.__typename !== 'Profile' ||
    data.contentPostsProfile?.__typename !== 'Profile' ||
    data.emptyPostsProfile?.__typename !== 'Profile' ||
    !data.homeTimeline
  ) {
    throw new Error('PostsStoriesQuery must return a home timeline fixture.');
  }

  return {
    composerProfile: requireFragment(data.composerProfile.composer, 'composer profile'),
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

function requirePresentationCallbacks(args: PostsStoryArgs): PresentationCallbacks {
  if (!args.onPostAuthor || !args.onPostDetail || !args.onSourceAuthor || !args.onSourcePost) {
    throw new Error('Repost/Quote presentation stories require isolated link callbacks.');
  }
  return {
    postAuthor: args.onPostAuthor,
    postDetail: args.onPostDetail,
    sourceAuthor: args.onSourceAuthor,
    sourcePost: args.onSourcePost,
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
  const pathname = usePathname();

  return (
    <Catalog>
      <Text testID="current-story-pathname">{pathname}</Text>
      <View testID="production-home-reposts">
        <PostList homeTimeline={data.homeTimeline} />
      </View>
      <View testID="production-profile-reposts">
        <PostList profile={data.contentPostsProfile} />
      </View>
    </Catalog>
  );
}

function RepostQuotePresentationStory({ callbacks, postId }: PresentationStoryProps) {
  const post = requireStoryPostById(storyPosts, postId);
  const renderMockLink: PostPresentationLinkRenderer = ({
    accessibilityLabel,
    children,
    target,
  }) => (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="link"
      onPress={callbacks[target]}
    >
      {children}
    </Pressable>
  );

  return (
    <PostSourcePresentationView
      onPostPress={callbacks.postDetail}
      onSourcePostPress={callbacks.sourcePost}
      post={toPostSourcePresentationData(post)}
      renderLink={renderMockLink}
    />
  );
}

function ComposerStory() {
  return (
    <Catalog>
      <PostComposer profile={usePostsStoryData().composerProfile} />
    </Catalog>
  );
}

function LinkedPostListItemStory() {
  const { posts } = usePostsStoryData();
  const pathname = usePathname();

  return (
    <Catalog>
      <Text testID="current-story-pathname">{pathname}</Text>
      <PostListItem post={requireFragment(requirePost(posts, 14).listItem, 'linked post item')} />
    </Catalog>
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
                  <PostListItem post={requireFragment(item.post.listItem, 'thread list item')} />
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
  component: PostCatalog,
  parameters: {
    relay: {
      data: {
        composerProfile,
        contentPostsProfile,
        emptyPostsProfile,
        homeTimeline,
        nodes: storyPosts,
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
    expect(canvasElement.querySelector('a[href="/@user@remote.example"]')).toBeInTheDocument();
    expect(
      canvasElement.querySelector('a[href="/@user@remote.example/detail-remote"]'),
    ).toBeInTheDocument();
    expect(
      canvas.getByRole('link', { name: /안전한 외부 링크, https:\/\/example\.com\/path/ }),
    ).toBeVisible();
    expect(canvasElement.textContent).toContain('강제 개행을 함께 표시합니다.');
    expect(canvasElement.textContent).toContain(
      '강제 개행을 함께 표시합니다.\n\n두 번째 문단입니다.',
    );
    expect(canvas.getByText('미지원 문서는 안전한 Plain Text로 표시합니다.')).toBeVisible();
    expect(canvas.queryByText('실행하면 안 되는 구조')).not.toBeInTheDocument();
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
      repostOfQuoteRow!.querySelector('a[href="/@deep-source@remote.example/post-source-depth-2"]'),
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
    expect(repostOfQuoteRow!.querySelectorAll('[data-testid="source-post-preview"]')).toHaveLength(
      0,
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
    expect(repostOfQuoteRow!.textContent).not.toContain(
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

export const PureRepost: Story = {
  args: {
    onPostAuthor: fn(),
    onPostDetail: fn(),
    onSourceAuthor: fn(),
    onSourcePost: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getAllByRole('link')).toHaveLength(3);
    const repostIcon = canvas.getByText('↻');
    const repostLabel = canvas.getByText('재게시한 코스모 사용자님이 재게시함');
    const repostAuthorLink = canvas.getByLabelText('재게시한 코스모 사용자 프로필 보기');
    const sourceAuthorName = canvas.getByText('아주 긴 Source 작성자 표시 이름');
    const sourceAuthorLink = canvas.getByLabelText('아주 긴 Source 작성자 표시 이름 프로필 보기');
    const sourceAvatar = canvas.getByLabelText('아주 긴 Source 작성자 표시 이름 프로필 이미지');
    expect(repostAuthorLink.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    const linkGap =
      sourceAuthorLink.getBoundingClientRect().top -
      repostAuthorLink.getBoundingClientRect().bottom;
    expect(linkGap).toBeGreaterThanOrEqual(0);
    expect(linkGap).toBeLessThanOrEqual(1);
    expect(repostLabel.getBoundingClientRect().height).toBeLessThanOrEqual(
      typography.sm.lineHeight,
    );
    expect(repostLabel).toHaveStyle({ fontWeight: '400' });
    expect(
      Math.abs(
        repostIcon.getBoundingClientRect().right - sourceAvatar.getBoundingClientRect().right,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        repostLabel.getBoundingClientRect().left - sourceAuthorName.getBoundingClientRect().left,
      ),
    ).toBeLessThanOrEqual(1);
    const attributionGap =
      sourceAuthorName.getBoundingClientRect().top - repostLabel.getBoundingClientRect().bottom;
    expect(attributionGap).toBeGreaterThanOrEqual(0);
    expect(attributionGap).toBeLessThanOrEqual(spacing.xs);
    await userEvent.click(repostAuthorLink);
    await expect(args.onPostAuthor).toHaveBeenCalledTimes(1);
    await expect(args.onSourceAuthor).toHaveBeenCalledTimes(0);
    await expect(args.onSourcePost).toHaveBeenCalledTimes(0);
    await userEvent.click(sourceAuthorLink);
    await expect(args.onPostAuthor).toHaveBeenCalledTimes(1);
    await expect(args.onSourceAuthor).toHaveBeenCalledTimes(1);
    await expect(args.onSourcePost).toHaveBeenCalledTimes(0);
    await userEvent.click(canvas.getByTestId('source-post-body'));
    await expect(args.onPostAuthor).toHaveBeenCalledTimes(1);
    await expect(args.onSourceAuthor).toHaveBeenCalledTimes(1);
    await expect(args.onSourcePost).toHaveBeenCalledTimes(1);
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-repost"
    />
  ),
};

export const PureRepostOfQuote: Story = {
  args: {
    onPostAuthor: fn(),
    onPostDetail: fn(),
    onSourceAuthor: fn(),
    onSourcePost: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.queryAllByTestId('source-post-preview')).toHaveLength(0);
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
    await expect(args.onPostAuthor).not.toHaveBeenCalled();
    await expect(args.onPostDetail).not.toHaveBeenCalled();
    await expect(args.onSourceAuthor).not.toHaveBeenCalled();
    await expect(args.onSourcePost).toHaveBeenCalledTimes(1);
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-repost-of-quote"
    />
  ),
};

export const Quote: Story = {
  args: {
    onPostAuthor: fn(),
    onPostDetail: fn(),
    onSourceAuthor: fn(),
    onSourcePost: fn(),
  },
  play: async ({ args, canvasElement }) => {
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
    await expect(args.onPostDetail).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByLabelText('재게시한 코스모 사용자의 게시글 보기'));
    await expect(args.onPostDetail).toHaveBeenCalledTimes(2);
    await expect(args.onPostAuthor).not.toHaveBeenCalled();
    await expect(args.onSourceAuthor).not.toHaveBeenCalled();
    await expect(args.onSourcePost).not.toHaveBeenCalled();
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-quote"
    />
  ),
};

export const QuoteOfQuote: Story = {
  args: {
    onPostAuthor: fn(),
    onPostDetail: fn(),
    onSourceAuthor: fn(),
    onSourcePost: fn(),
  },
  play: async ({ args, canvasElement }) => {
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
    await expect(args.onPostAuthor).not.toHaveBeenCalled();
    await expect(args.onPostDetail).not.toHaveBeenCalled();
    await expect(args.onSourceAuthor).not.toHaveBeenCalled();
    await expect(args.onSourcePost).toHaveBeenCalledTimes(1);
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-quote-of-quote"
    />
  ),
};

export const ReplyQuote: Story = {
  args: {
    onPostAuthor: fn(),
    onPostDetail: fn(),
    onSourceAuthor: fn(),
    onSourcePost: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('답글 관계를 유지하는 인용입니다.')).toBeVisible();
    expect(canvas.getByTestId('source-post-preview')).toBeVisible();

    await userEvent.click(canvas.getByTestId('post-body'));
    await expect(args.onPostDetail).toHaveBeenCalledTimes(1);
    await expect(args.onSourcePost).not.toHaveBeenCalled();
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-reply-quote"
    />
  ),
};

export const QuoteWithoutSource: Story = {
  args: {
    onPostAuthor: fn(),
    onPostDetail: fn(),
    onSourceAuthor: fn(),
    onSourcePost: fn(),
  },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('원문을 더 이상 볼 수 없어도 남는 인용 본문입니다.')).toBeVisible();
    expect(canvas.queryByTestId('source-post-preview')).not.toBeInTheDocument();
    expect(canvas.getAllByRole('link')).toHaveLength(2);
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-quote-source-null"
    />
  ),
};

export const OrdinaryPost: Story = {
  args: {
    onPostAuthor: fn(),
    onPostDetail: fn(),
    onSourceAuthor: fn(),
    onSourcePost: fn(),
  },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('짧은 본문 한 줄.')).toBeVisible();
    expect(canvas.getByTestId('post-timestamp')).toHaveTextContent(
      formatTimelineTimestamp(shortPost.createdAt),
    );
    expect(canvas.queryByTestId('source-post-preview')).not.toBeInTheDocument();
    expect(canvas.getAllByRole('link')).toHaveLength(2);
  },
  render: (args) => (
    <RepostQuotePresentationStory callbacks={requirePresentationCallbacks(args)} postId="short" />
  ),
};

export const InvalidContentlessReplySource: Story = {
  args: {
    onPostAuthor: fn(),
    onPostDetail: fn(),
    onSourceAuthor: fn(),
    onSourcePost: fn(),
  },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByTestId('post-source-presentation')).not.toBeInTheDocument();
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-invalid-contentless-reply-source"
    />
  ),
};

export const LinkedSourceQuote: Story = {
  args: {
    onPostAuthor: fn(),
    onPostDetail: fn(),
    onSourceAuthor: fn(),
    onSourcePost: fn(),
  },
  play: async ({ args, canvasElement }) => {
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
      await expect(args.onPostDetail).not.toHaveBeenCalled();
      expect(args.onSourcePost).not.toHaveBeenCalled();

      await userEvent.click(within(postBody).getByText(/두 번째 문단입니다\./));
      await expect(args.onPostDetail).toHaveBeenCalledTimes(1);
      await expect(args.onSourcePost).not.toHaveBeenCalled();
    } finally {
      Linking.openURL = originalOpenURL;
    }
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-quote-linked-source"
    />
  ),
};

export const RepostQuoteLongContentMobile: Story = {
  args: {
    onPostAuthor: fn(),
    onPostDetail: fn(),
    onSourceAuthor: fn(),
    onSourcePost: fn(),
  },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    expect(root).toBeVisible();
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-quote-long"
    />
  ),
};

export const LinkedBodyKeepsDetailNavigationIsolated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const openURL = fn(async () => undefined);
    const originalOpenURL = Linking.openURL;
    Linking.openURL = openURL;

    try {
      await userEvent.click(canvas.getByLabelText('안전한 외부 링크, https://example.com/path'));
      await expect(openURL).toHaveBeenCalledWith('https://example.com/path');
      await expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent(
        '/@kosmo/post-1',
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

    expect(Array.from(thread.children).map((row) => row.getAttribute('data-testid'))).toEqual([
      'post-thread-item-thread-root',
      'post-thread-item-thread-parent',
      'post-thread-current-thread-current',
      'post-thread-item-thread-child',
      'post-thread-item-thread-sibling',
      'post-thread-item-thread-reply-quote',
    ]);
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
            node: {
              ...routeCurrentPost,
              reactionCounts: routeCurrentPostReactionCounts,
              replyAncestors: [routeParentPost, routeRootPost],
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
    expect(Array.from(thread.children).map((row) => row.getAttribute('data-testid'))).toEqual([
      'post-thread-item-route-root',
      'post-thread-item-route-parent',
      'post-thread-current-route-current',
      'post-thread-item-route-child',
      'post-thread-item-route-sibling',
      'post-thread-item-route-reply-quote',
      'post-thread-item-route-source-null',
    ]);
    expect(canvas.getByText('Reply+Quote 자체 Content')).toBeVisible();
    expect(canvas.getByRole('button', { name: '❤️ 반응 2개 보기' })).toBeVisible();
    const source = canvas.getByTestId('post-thread-source-route-source');
    expect(within(source).getByText('Source 본문')).toBeVisible();
    expect(getComputedStyle(source).borderTopWidth).toBe('1px');
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
    await userEvent.click(within(source).getByText('Source 본문'));
    expect(canvas.getByTestId('current-story-pathname')).toHaveTextContent('/@kosmo/route-source');
  },
  render: () => (
    <>
      <Text testID="current-story-pathname">{usePathname()}</Text>
      <PostDetailScreen />
    </>
  ),
};

export const PostDetailThreadUnavailableAncestorBoundary: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailQuery: {
          data: {
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
    expect(canvas.queryByText('숨겨진 답글')).not.toBeInTheDocument();
    expect(canvas.queryByText('조회할 수 없는 상위 Post')).not.toBeInTheDocument();
  },
  render: () => <PostDetailScreen />,
};

export const PostDetailThreadShortContentAutoFills: Story = {
  parameters: {
    relay: {
      operationResponses: {
        PostDetailQuery: {
          data: {
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

export const ComposerDefault: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('textbox', { name: '게시글 본문' })).not.toHaveAttribute('maxlength');
  },
  render: () => <ComposerStory />,
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

    const menu = await canvas.findByRole('menu', { name: '게시글 공개 설정' });
    expect(menu).toBeVisible();
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /^공개/ }));
    await waitFor(() => {
      expect(canvas.queryByRole('menu', { name: '게시글 공개 설정' })).not.toBeInTheDocument();
    });
    await expect(canvas.getByRole('button', { name: '공개' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    await expect(body).toHaveValue('');
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
