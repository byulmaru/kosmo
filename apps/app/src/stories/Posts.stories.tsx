import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Temporal } from 'temporal-polyfill';
import { PostBody } from '@/components/post/PostBody';
import { PostComposer } from '@/components/post/PostComposer';
import { PostLayout } from '@/components/post/PostLayout';
import { PostList } from '@/components/post/PostList';
import { PostListItem } from '@/components/post/PostListItem';
import { longBody, post, profile, profileWithPosts, timeline } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
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

function PostCatalog() {
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

function PostListCatalog() {
  const data = usePostsStoryData();

  return (
    <Catalog>
      <Section title="Loading">
        <PostList loading />
      </Section>
      <Section title="Error and retry">
        <PostList error onRetry={() => undefined} />
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

function ComposerStory() {
  return (
    <Catalog>
      <PostComposer profile={usePostsStoryData().composerProfile} />
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
    expect(canvasElement.textContent).toContain('두 번째 문단입니다.');
    expect(canvas.getByText('미지원 문서는 안전한 Plain Text로 표시합니다.')).toBeVisible();
    expect(canvas.queryByText('실행하면 안 되는 구조')).not.toBeInTheDocument();
  },
};

export const ListLoadingErrorEmptyAndContent: Story = { render: () => <PostListCatalog /> };

export const ComposerDefault: Story = { render: () => <ComposerStory /> };

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
