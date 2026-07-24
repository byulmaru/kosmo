import { usePathname } from 'expo-router';
import { Linking, Pressable, Text } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Temporal } from 'temporal-polyfill';
import { PostBody } from '@/components/post/PostBody';
import { PostComposer } from '@/components/post/PostComposer';
import { PostLayout } from '@/components/post/PostLayout';
import { PostList } from '@/components/post/PostList';
import { PostListItem } from '@/components/post/PostListItem';
import { PostSourcePresentationView } from '@/components/post/PostSourcePresentationView';
import { formatTimelineTimestamp } from '@/lib/date';
import { spacing, typography } from '@/theme/tokens';
import { longBody, post, profile, profileWithPosts, timeline } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  PostPresentationLinkRenderer,
  PostSourcePresentationData,
} from '@/components/post/PostSourcePresentationView';
import type { PostsStoriesQuery as PostsStoriesQueryType } from './__generated__/PostsStoriesQuery.graphql';

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
const linkedSourceQuote = post({
  bodyText: '외부 링크가 있는 원문을 인용합니다.',
  id: 'post-quote-linked-source',
  profile: repostAuthor,
  repostSource: linkedPost,
});
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
  sourcePost,
  pureRepost,
  quotePost,
  replyQuotePost,
  quoteWithoutSource,
  invalidContentlessReplySource,
  longSourcePost,
  longQuotePost,
  linkedSourceQuote,
];
const composerProfile = profile({ id: 'profile-composer' });
const emptyPostsProfile = profileWithPosts([], { id: 'profile-posts-empty' });
const contentPostsProfile = profileWithPosts([shortPost, longPost, emptyPost], {
  id: 'profile-posts-content',
});
const homeTimeline = timeline(shortPost, multilinePost);

const PostsStoriesQuery = graphql`
  query PostsStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Post {
        id
        createdAt
        profile {
          displayName
          handle
          relativeHandle
        }
        content {
          bodyText
          document
        }
        replyParent {
          id
        }
        repostSource {
          id
          createdAt
          profile {
            displayName
            handle
            relativeHandle
          }
          content {
            bodyText
            document
          }
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

type PostNode = Extract<
  NonNullable<PostsStoriesQueryType['response']['nodes'][number]>,
  { readonly __typename: 'Post' }
>;

type PostsStoryArgs = {
  onPostAuthor?: ReturnType<typeof fn>;
  onRetry?: ReturnType<typeof fn>;
  onSourceAuthor?: ReturnType<typeof fn>;
  onSourcePost?: ReturnType<typeof fn>;
};

type PresentationCallbacks = {
  postAuthor: ReturnType<typeof fn>;
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

function requirePostById(posts: ReadonlyArray<PostNode>, id: string): PostNode {
  const result = posts.find((post) => post.id === id);
  if (!result) {
    throw new Error(`Missing post fixture with id ${id}.`);
  }
  return result;
}

function toPostSourcePresentationData(post: PostNode): PostSourcePresentationData {
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
  if (!args.onPostAuthor || !args.onSourceAuthor || !args.onSourcePost) {
    throw new Error('Repost/Quote presentation stories require isolated link callbacks.');
  }
  return {
    postAuthor: args.onPostAuthor,
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

function RepostQuotePresentationStory({ callbacks, postId }: PresentationStoryProps) {
  const { posts } = usePostsStoryData();
  const post = requirePostById(posts, postId);
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

export const PureRepost: Story = {
  args: { onPostAuthor: fn(), onSourceAuthor: fn(), onSourcePost: fn() },
  play: async ({ args, canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getAllByRole('link')).toHaveLength(3);
    const repostIcon = canvas.getByText('↻');
    const repostLabel = canvas.getByText('재게시한 코스모 사용자님이 재게시함');
    const sourceAuthorName = canvas.getByText('아주 긴 Source 작성자 표시 이름');
    const sourceAvatar = canvas.getByLabelText('아주 긴 Source 작성자 표시 이름 프로필 이미지');
    expect(repostLabel.getBoundingClientRect().height).toBeLessThanOrEqual(
      typography.sm.lineHeight,
    );
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
    expect(attributionGap).toBeGreaterThanOrEqual(-spacing.xs);
    expect(attributionGap).toBeLessThanOrEqual(spacing.xs);
    await userEvent.click(canvas.getByLabelText('재게시한 코스모 사용자 프로필 보기'));
    await expect(args.onPostAuthor).toHaveBeenCalledTimes(1);
    await expect(args.onSourceAuthor).toHaveBeenCalledTimes(0);
    await expect(args.onSourcePost).toHaveBeenCalledTimes(0);
    await userEvent.click(canvas.getByLabelText('아주 긴 Source 작성자 표시 이름 프로필 보기'));
    await expect(args.onPostAuthor).toHaveBeenCalledTimes(1);
    await expect(args.onSourceAuthor).toHaveBeenCalledTimes(1);
    await expect(args.onSourcePost).toHaveBeenCalledTimes(0);
    await userEvent.click(canvas.getByLabelText('원문 게시글 보기'));
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

export const Quote: Story = {
  args: { onPostAuthor: fn(), onSourceAuthor: fn(), onSourcePost: fn() },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('이 원문에 덧붙이는 인용자의 본문입니다.')).toBeVisible();
    expect(canvas.getByTestId('post-timestamp')).toHaveTextContent(
      formatTimelineTimestamp(quotePost.createdAt),
    );
    const preview = canvas.getByTestId('source-post-preview');
    expect(preview.textContent).toContain('원문 작성자의 긴 본문과 줄바꿈을 표시합니다.');
    expect(canvas.getAllByRole('link')).toHaveLength(3);
    expect(within(preview).getAllByRole('link')).toHaveLength(2);
    expect(within(preview).queryByRole('button')).not.toBeInTheDocument();
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-quote"
    />
  ),
};

export const ReplyQuote: Story = {
  args: { onPostAuthor: fn(), onSourceAuthor: fn(), onSourcePost: fn() },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('답글 관계를 유지하는 인용입니다.')).toBeVisible();
    expect(canvas.getByTestId('source-post-preview')).toBeVisible();
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-reply-quote"
    />
  ),
};

export const QuoteWithoutSource: Story = {
  args: { onPostAuthor: fn(), onSourceAuthor: fn(), onSourcePost: fn() },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('원문을 더 이상 볼 수 없어도 남는 인용 본문입니다.')).toBeVisible();
    expect(canvas.queryByTestId('source-post-preview')).not.toBeInTheDocument();
    expect(canvas.getAllByRole('link')).toHaveLength(1);
  },
  render: (args) => (
    <RepostQuotePresentationStory
      callbacks={requirePresentationCallbacks(args)}
      postId="post-quote-source-null"
    />
  ),
};

export const OrdinaryPost: Story = {
  args: { onPostAuthor: fn(), onSourceAuthor: fn(), onSourcePost: fn() },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByTestId('post-source-presentation');
    const canvas = within(root);
    expect(canvas.getByText('짧은 본문 한 줄.')).toBeVisible();
    expect(canvas.getByTestId('post-timestamp')).toHaveTextContent(
      formatTimelineTimestamp(shortPost.createdAt),
    );
    expect(canvas.queryByTestId('source-post-preview')).not.toBeInTheDocument();
    expect(canvas.getAllByRole('link')).toHaveLength(1);
  },
  render: (args) => (
    <RepostQuotePresentationStory callbacks={requirePresentationCallbacks(args)} postId="short" />
  ),
};

export const InvalidContentlessReplySource: Story = {
  args: { onPostAuthor: fn(), onSourceAuthor: fn(), onSourcePost: fn() },
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
  args: { onPostAuthor: fn(), onSourceAuthor: fn(), onSourcePost: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const openURL = fn(async () => undefined);
    const originalOpenURL = Linking.openURL;
    Linking.openURL = openURL;

    try {
      await userEvent.click(canvas.getByLabelText('안전한 외부 링크, https://example.com/path'));
      await expect(openURL).toHaveBeenCalledWith('https://example.com/path');
      expect(args.onSourcePost).not.toHaveBeenCalled();
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
  args: { onPostAuthor: fn(), onSourceAuthor: fn(), onSourcePost: fn() },
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
