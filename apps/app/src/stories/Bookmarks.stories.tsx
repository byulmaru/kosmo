import { usePathname } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, spyOn, userEvent, within } from 'storybook/test';
import ProtectedLayout from '@/app/(tabs)/(protected)/_layout';
import BookmarksScreen from '@/app/(tabs)/(protected)/bookmarks';
import { BookmarkConnectionList } from '@/components/bookmark/BookmarkConnectionList';
import { BookmarkList } from '@/components/bookmark/BookmarkList';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { SessionErrorProvider, SessionProvider } from '@/session/SessionProvider';
import { post, profile } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { BookmarksIntegrationStoriesQuery as BookmarksIntegrationStoriesQueryType } from './__generated__/BookmarksIntegrationStoriesQuery.graphql';
import type { BookmarksProfileSwitchStoriesQuery as BookmarksProfileSwitchStoriesQueryType } from './__generated__/BookmarksProfileSwitchStoriesQuery.graphql';
import type { BookmarksStoriesQuery as BookmarksStoriesQueryType } from './__generated__/BookmarksStoriesQuery.graphql';

const author = profile({
  displayName: '우주 기록자',
  handle: 'space-writer',
  id: 'bookmark-author',
  relativeHandle: '@space-writer',
});
const targetPosts = [
  {
    ...post({
      bodyText: '첫 번째로 저장한 게시글입니다.',
      id: 'bookmark-target-1',
      profile: author,
    }),
    viewerReactions: [],
  },
  {
    ...post({
      bodyText: '두 번째로 저장한 게시글입니다.',
      id: 'bookmark-target-2',
      profile: author,
    }),
    viewerReactions: [],
  },
];
const bookmarkOwner = {
  ...profile({ id: 'bookmark-owner' }),
  bookmarks: {
    edges: [
      {
        cursor: 'bookmark-cursor-2',
        node: { __typename: 'Bookmark', id: 'bookmark-2', post: targetPosts[1] },
      },
      {
        cursor: 'bookmark-cursor-1',
        node: { __typename: 'Bookmark', id: 'bookmark-1', post: targetPosts[0] },
      },
      {
        cursor: 'bookmark-cursor-null',
        node: { __typename: 'Bookmark', id: 'bookmark-null', post: null },
      },
    ],
    pageInfo: { endCursor: 'bookmark-cursor-1', hasNextPage: true },
  },
};
const bookmarkNextPage = {
  node: {
    ...bookmarkOwner,
    bookmarks: {
      edges: [
        {
          cursor: 'bookmark-cursor-0',
          node: {
            __typename: 'Bookmark',
            id: 'bookmark-0',
            post: {
              ...post({
                bodyText: '더 이전에 저장한 게시글입니다.',
                id: 'bookmark-target-3',
                profile: author,
              }),
              viewerReactions: [],
            },
          },
        },
      ],
      pageInfo: { endCursor: 'bookmark-cursor-0', hasNextPage: false },
    },
  },
};
const bookmarkOtherOwner = {
  ...profile({ id: 'bookmark-owner-b' }),
  bookmarks: {
    edges: [
      {
        cursor: 'bookmark-b-cursor-1',
        node: {
          __typename: 'Bookmark',
          id: 'bookmark-b-1',
          post: {
            ...post({
              bodyText: 'B 프로필로 저장한 게시글입니다.',
              id: 'bookmark-target-b',
              profile: author,
            }),
            viewerReactions: [],
          },
        },
      },
    ],
    pageInfo: { endCursor: 'bookmark-b-cursor-1', hasNextPage: true },
  },
};
const bookmarkDeepSource = {
  ...post({
    bodyText: '북마크에서 표시하지 않아야 하는 두 번째 Source 본문입니다.',
    id: 'bookmark-source-depth-2',
    profile: profile({
      displayName: '깊은 원문 작성자',
      handle: 'deep-bookmark-source',
      id: 'bookmark-deep-source-author',
      relativeHandle: '@deep-bookmark-source',
    }),
  }),
  viewerReactions: [],
};
const bookmarkDirectQuote = {
  ...post({
    bodyText: '북마크에서 한 단계만 표시하는 인용 Source입니다.',
    id: 'bookmark-source-quote',
    profile: profile({
      displayName: '인용 Source 작성자',
      handle: 'bookmark-source',
      id: 'bookmark-source-author',
      relativeHandle: '@bookmark-source',
    }),
    repostSource: bookmarkDeepSource,
  }),
  viewerReactions: [],
};
const bookmarkedQuoteOfQuote = {
  ...post({
    bodyText: '북마크에 저장한 인용 게시글입니다.',
    id: 'bookmark-quote-of-quote',
    profile: profile({
      displayName: '북마크 인용 작성자',
      handle: 'bookmark-quote-author',
      id: 'bookmark-quote-author',
      relativeHandle: '@bookmark-quote-author',
    }),
    repostSource: bookmarkDirectQuote,
  }),
  viewerReactions: [],
};
const bookmarkRepostAuthor = profile({
  displayName: '북마크 재게시 작성자',
  handle: 'bookmark-reposter',
  id: 'bookmark-repost-author',
  relativeHandle: '@bookmark-reposter',
});
const bookmarkPureRepostSource = {
  ...post({
    bodyText: '북마크 순수 재게시의 일반 Source입니다.',
    id: 'bookmark-pure-repost-source',
    profile: profile({
      displayName: '순수 재게시 Source 작성자',
      handle: 'bookmark-pure-source',
      id: 'bookmark-pure-source-author',
      relativeHandle: '@bookmark-pure-source',
    }),
  }),
  viewerReactions: [],
};
const bookmarkedPureRepost = {
  ...post({
    bodyText: null,
    id: 'bookmark-pure-repost',
    profile: bookmarkRepostAuthor,
    repostSource: bookmarkPureRepostSource,
  }),
  viewerReactions: [],
};
const bookmarkPresentationOwner = {
  ...profile({ id: 'bookmark-owner' }),
  bookmarks: {
    edges: [
      {
        cursor: 'bookmark-presentation-cursor',
        node: {
          __typename: 'Bookmark',
          id: 'bookmark-presentation',
          post: bookmarkedQuoteOfQuote,
        },
      },
      {
        cursor: 'bookmark-pure-repost-cursor',
        node: {
          __typename: 'Bookmark',
          id: 'bookmark-pure-repost-entry',
          post: bookmarkedPureRepost,
        },
      },
    ],
    pageInfo: { endCursor: 'bookmark-pure-repost-cursor', hasNextPage: false },
  },
};

const BookmarksStoriesQuery = graphql`
  query BookmarksStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Post {
        id
        ...PostListItem_post @alias(as: "listItem")
      }
    }
  }
`;

const BookmarksIntegrationStoriesQuery = graphql`
  query BookmarksIntegrationStoriesQuery {
    node(id: "bookmark-owner") {
      __typename
      ... on Profile {
        ...BookmarkConnectionList_profile @alias(as: "bookmarkConnection")
      }
    }
  }
`;

const BookmarksProfileSwitchStoriesQuery = graphql`
  query BookmarksProfileSwitchStoriesQuery {
    first: node(id: "bookmark-owner") {
      __typename
      ... on Profile {
        ...BookmarkConnectionList_profile @alias(as: "bookmarkConnection")
      }
    }
    second: node(id: "bookmark-owner-b") {
      __typename
      ... on Profile {
        ...BookmarkConnectionList_profile @alias(as: "bookmarkConnection")
      }
    }
  }
`;

function BookmarkConnectionStory() {
  const data = useLazyLoadQuery<BookmarksIntegrationStoriesQueryType>(
    BookmarksIntegrationStoriesQuery,
    {},
  );
  if (data.node?.__typename !== 'Profile' || !data.node.bookmarkConnection) {
    throw new Error('Missing Bookmark connection Profile fixture.');
  }
  return (
    <>
      <Text style={{ display: 'none' }} testID="bookmark-story-pathname">
        {usePathname()}
      </Text>
      <BookmarkConnectionList profile={data.node.bookmarkConnection} />
    </>
  );
}

function BookmarkConnectionProfileSwitchStory() {
  const data = useLazyLoadQuery<BookmarksProfileSwitchStoriesQueryType>(
    BookmarksProfileSwitchStoriesQuery,
    {},
  );
  const [selectedProfile, setSelectedProfile] = useState<'first' | 'second'>('first');
  const profile = data[selectedProfile];
  if (profile?.__typename !== 'Profile' || !profile.bookmarkConnection) {
    throw new Error('Missing Bookmark connection Profile switch fixture.');
  }
  return (
    <>
      <Button onPress={() => setSelectedProfile('second')} tone="secondary">
        B 프로필로 전환
      </Button>
      <BookmarkConnectionList profile={profile.bookmarkConnection} />
    </>
  );
}

function BookmarksRouteStory() {
  return (
    <SessionProvider>
      <BookmarksScreen />
    </SessionProvider>
  );
}

function SessionErrorBookmarksRoute() {
  return (
    <SessionErrorProvider>
      <BookmarksScreen />
    </SessionErrorProvider>
  );
}

function ActorResetBookmarksRoute() {
  const { resetActor } = useRelayActor();

  return (
    <>
      <Button onPress={() => resetActor('bookmark-owner-b')}>프로필 전환</Button>
      <BookmarksRouteStory />
    </>
  );
}

function GuestBookmarkRoute() {
  const pathname = usePathname();

  return (
    <SessionProvider>
      <ProtectedLayout />
      <Text testID="bookmark-route-pathname">{pathname}</Text>
    </SessionProvider>
  );
}

function useBookmarkItems() {
  const data = useLazyLoadQuery<BookmarksStoriesQueryType>(BookmarksStoriesQuery, {
    ids: targetPosts.map(({ id }) => id),
  });

  return data.nodes.map((node, index) => {
    if (node?.__typename !== 'Post' || !node.listItem) {
      throw new Error(`Missing Bookmark Target Post fixture at index ${index}.`);
    }
    return { id: `bookmark-${index + 1}`, post: node.listItem };
  });
}

function StateCatalog() {
  const items = useBookmarkItems();
  return (
    <Catalog>
      <Section title="Loading">
        <BookmarkList loading />
      </Section>
      <Section title="Error">
        <BookmarkList error onRetry={() => undefined} />
      </Section>
      <Section title="Empty">
        <BookmarkList />
      </Section>
      <Section title="Populated">
        <BookmarkList items={items} />
      </Section>
    </Catalog>
  );
}

function InteractionCatalog() {
  const items = useBookmarkItems();
  const [retryCount, setRetryCount] = useState(0);
  const [loadCount, setLoadCount] = useState(0);
  return (
    <Catalog>
      <Text testID="bookmark-retry-count">retry:{retryCount}</Text>
      <BookmarkList error onRetry={() => setRetryCount((count) => count + 1)} />
      <Text testID="bookmark-load-count">load:{loadCount}</Text>
      <BookmarkList hasNext items={items} onLoadMore={() => setLoadCount((count) => count + 1)} />
    </Catalog>
  );
}

function LoadingMoreCatalog() {
  return (
    <BookmarkList hasNext isLoadingMore items={useBookmarkItems()} onLoadMore={() => undefined} />
  );
}

function ScrollableListCatalog() {
  const items = useBookmarkItems();
  const [loadCount, setLoadCount] = useState(0);
  const longItems = Array.from({ length: 12 }, (_, index) => ({
    id: `bookmark-scroll-${index}`,
    post: items[index % items.length]!.post,
  }));

  return (
    <View style={{ height: 320 }}>
      <Text testID="bookmark-scroll-load-count">load:{loadCount}</Text>
      <BookmarkList
        hasNext
        items={longItems}
        onLoadMore={() => setLoadCount((count) => count + 1)}
      />
    </View>
  );
}

const meta = {
  component: StateCatalog,
  parameters: {
    relay: { data: { nodes: targetPosts } },
    router: { pathname: '/bookmarks' },
  },
  title: 'KOSMO/Bookmarks/List',
} satisfies Meta<typeof StateCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatesAndCanonicalLinks: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('북마크 목록을 불러오는 중입니다.')).toBeVisible();
    expect(canvas.getByText('아직 북마크가 없어요')).toBeVisible();
    expect(canvas.getByText('북마크 목록을 불러오지 못했어요')).toBeVisible();
    const headings = canvas.getAllByRole('heading', { name: '북마크' });
    expect(headings).toHaveLength(4);
    for (const heading of headings) {
      expect(heading.parentElement?.getBoundingClientRect().height).toBe(64);
    }
    expect(canvas.getAllByRole('article')).toHaveLength(targetPosts.length);
    expect(canvasElement.querySelector('a[href="/@space-writer"]')).toBeInTheDocument();
    expect(
      canvasElement.querySelector('a[href="/@space-writer/bookmark-target-1"]'),
    ).toBeInTheDocument();
    expect(canvas.queryByRole('tab')).not.toBeInTheDocument();
    expect(canvas.queryByRole('tablist')).not.toBeInTheDocument();
    expect(canvas.queryByText('컬렉션')).not.toBeInTheDocument();
  },
};

export const RetryAndPaginationCallbacks: Story = {
  render: () => <InteractionCatalog />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    expect(canvas.getByTestId('bookmark-retry-count')).toHaveTextContent('retry:1');
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    expect(canvas.getByTestId('bookmark-load-count')).toHaveTextContent('load:1');
  },
};

export const NextPageLoading: Story = {
  render: () => <LoadingMoreCatalog />,
  play: ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: '불러오는 중' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  },
};

export const LongListScrollsToPagination: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: () => <ScrollableListCatalog />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scroller = canvas.getByTestId('bookmark-list-scroll');
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    scroller.scrollTop = scroller.scrollHeight;
    expect(scroller.scrollTop).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    expect(canvas.getByTestId('bookmark-scroll-load-count')).toHaveTextContent('load:1');
  },
};

export const ConnectionNextPageFailureRetrySucceeds: Story = {
  parameters: {
    relay: {
      data: { node: bookmarkOwner },
      paginationResponses: [
        { error: '다음 페이지를 불러오지 못했습니다.' },
        { data: bookmarkNextPage },
      ],
    },
  },
  render: () => <BookmarkConnectionStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getAllByRole('article')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '북마크를 더 불러오지 못했어요',
    );
    expect(canvas.getAllByRole('article')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findAllByRole('article')).resolves.toHaveLength(3);
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const ConnectionProfileSwitchClearsPaginationError: Story = {
  parameters: {
    relay: {
      data: { first: bookmarkOwner, second: bookmarkOtherOwner },
      paginationResponses: [{ error: '다음 페이지를 불러오지 못했습니다.' }],
    },
  },
  render: () => <BookmarkConnectionProfileSwitchStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '북마크를 더 불러오지 못했어요',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'B 프로필로 전환' }));
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    expect(canvas.getByRole('button', { name: '더 불러오기' })).toBeVisible();
  },
};

export const RepostQuoteUsesOneSourceDepth: Story = {
  parameters: { relay: { data: { node: bookmarkPresentationOwner } } },
  render: () => <BookmarkConnectionStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const quoteArticle = canvas
      .getByText('북마크에 저장한 인용 게시글입니다.')
      .closest<HTMLElement>('[role="article"]');
    const pureRepostArticle = canvas
      .getByText('북마크 재게시 작성자님이 재게시함')
      .closest<HTMLElement>('[role="article"]');

    expect(canvas.getAllByRole('article')).toHaveLength(2);
    expect(quoteArticle).not.toBeNull();
    expect(pureRepostArticle).not.toBeNull();
    expect(
      within(quoteArticle!).getByText('북마크에서 한 단계만 표시하는 인용 Source입니다.'),
    ).toBeVisible();
    const pureRepostRow = within(pureRepostArticle!).getByTestId('post-list-standard-row');
    expect(
      within(pureRepostRow).getByText('북마크 순수 재게시의 일반 Source입니다.'),
    ).toBeVisible();
    expect(within(pureRepostArticle!).queryByTestId('source-post-preview')).toBeNull();
    expect(pureRepostArticle!.querySelector('[role="article"]')).toBeNull();
    expect(
      canvas.queryByText('북마크에서 표시하지 않아야 하는 두 번째 Source 본문입니다.'),
    ).not.toBeInTheDocument();

    const quoteCanvas = within(quoteArticle!);
    expect(quoteCanvas.getByRole('link', { name: '원문 게시글 보기' })).toHaveAttribute(
      'href',
      '/@bookmark-source/bookmark-source-quote',
    );
    const sourceBody = quoteCanvas.getByTestId('source-post-body');
    expect(sourceBody.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(sourceBody.closest('[role="link"]')).toBeNull();
    expect(canvas.queryByRole('link', { name: '인용한 게시글 보기' })).not.toBeInTheDocument();
    expect(canvasElement.querySelector('a a')).toBeNull();
    expect(canvasElement.querySelector('[role="link"] [role="link"]')).toBeNull();

    await userEvent.click(
      quoteCanvas.getByRole('link', { name: '인용 Source 작성자 프로필 보기' }),
    );
    expect(canvas.getByTestId('bookmark-story-pathname')).toHaveTextContent('/@bookmark-source');

    await userEvent.click(quoteCanvas.getByRole('link', { name: '원문 게시글 보기' }));
    expect(canvas.getByTestId('bookmark-story-pathname')).toHaveTextContent(
      '/@bookmark-source/bookmark-source-quote',
    );

    await userEvent.click(
      quoteCanvas.getByRole('link', { name: '인용 Source 작성자 프로필 보기' }),
    );
    expect(canvas.getByTestId('bookmark-story-pathname')).toHaveTextContent('/@bookmark-source');

    await userEvent.click(sourceBody);
    expect(canvas.getByTestId('bookmark-story-pathname')).toHaveTextContent(
      '/@bookmark-source/bookmark-source-quote',
    );

    await userEvent.click(
      within(pureRepostArticle!).getByRole('link', {
        name: '북마크 재게시 작성자 프로필 보기',
      }),
    );
    expect(canvas.getByTestId('bookmark-story-pathname')).toHaveTextContent('/@bookmark-reposter');

    await userEvent.click(within(pureRepostRow).getByTestId('post-list-row-body'));
    expect(canvas.getByTestId('bookmark-story-pathname')).toHaveTextContent(
      '/@bookmark-pure-source/bookmark-pure-repost-source',
    );
  },
};

function PopulatedList() {
  return (
    <Catalog>
      <BookmarkList items={useBookmarkItems()} />
    </Catalog>
  );
}

export const WebCenterColumn: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: '북마크' })).toBeVisible();
    expect(canvas.getAllByRole('article')).toHaveLength(targetPosts.length);
    expect(canvas.queryByRole('tab')).not.toBeInTheDocument();
  },
  render: () => <PopulatedList />,
};

export const SelectedProfileRoute: Story = {
  parameters: {
    relay: {
      operationResponses: {
        BookmarksPageQuery: {
          data: {
            currentSession: { id: 'bookmark-session', selectedProfile: bookmarkOwner },
          },
        },
        SessionProviderQuery: {
          data: {
            currentSession: { id: 'bookmark-session', selectedProfile: bookmarkOwner },
            me: { id: 'bookmark-account', name: 'bookmark-account' },
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const articles = await canvas.findAllByRole('article');
    expect(articles).toHaveLength(2);
    expect(articles[0]).toHaveTextContent('두 번째로 저장한 게시글입니다.');
    expect(articles[1]).toHaveTextContent('첫 번째로 저장한 게시글입니다.');
    expect(
      canvasElement.querySelector('a[href="/@space-writer/bookmark-target-1"]'),
    ).toBeInTheDocument();
  },
  render: () => <BookmarksRouteStory />,
};

export const NoSelectedProfileSkipsBookmarkQuery: Story = {
  parameters: {
    relay: {
      operationResponses: {
        BookmarksPageQuery: { error: 'Bookmark query must not run without a selected Profile.' },
        SessionProviderQuery: {
          data: {
            currentSession: { id: 'bookmark-session', selectedProfile: null },
            me: { id: 'bookmark-account', name: 'bookmark-account' },
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).findByText('프로필이 필요해요')).resolves.toBeVisible();
  },
  render: () => <BookmarksRouteStory />,
};

export const SessionErrorStillUsesBookmarkQuery: Story = {
  parameters: {
    relay: {
      operationResponses: {
        BookmarksPageQuery: {
          data: {
            currentSession: { id: 'bookmark-session', selectedProfile: bookmarkOwner },
          },
        },
      },
    },
  },
  render: () => <SessionErrorBookmarksRoute />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findAllByRole('article')).resolves.toHaveLength(2);
    expect(canvas.queryByText('프로필이 필요해요')).not.toBeInTheDocument();
  },
};

export const InitialRouteErrorAndRetry: Story = {
  beforeEach: () => {
    const originalError = console.error;
    const errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const isExpectedRouteError = args.some((argument) =>
        argument instanceof Error
          ? argument.message === '북마크 목록을 불러오지 못했습니다.'
          : typeof argument === 'string' && argument.includes('북마크 목록을 불러오지 못했습니다.'),
      );

      if (!isExpectedRouteError) {
        originalError(...args);
      }
    });

    return () => errorSpy.mockRestore();
  },
  parameters: {
    relay: {
      operationResponses: {
        BookmarksPageQuery: { error: '북마크 목록을 불러오지 못했습니다.' },
        SessionProviderQuery: {
          data: {
            currentSession: { id: 'bookmark-session', selectedProfile: bookmarkOwner },
            me: { id: 'bookmark-account', name: 'bookmark-account' },
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '북마크 목록을 불러오지 못했어요',
    );
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findByText('북마크 목록을 불러오는 중입니다.')).resolves.toBeVisible();
  },
  render: () => <BookmarksRouteStory />,
};

export const ActorResetUsesNextProfileConnection: Story = {
  parameters: {
    relay: {
      operationResponses: {
        BookmarksPageQuery: [
          {
            data: { currentSession: { id: 'bookmark-session-a', selectedProfile: bookmarkOwner } },
          },
          {
            data: {
              currentSession: { id: 'bookmark-session-b', selectedProfile: bookmarkOtherOwner },
            },
          },
        ],
        SessionProviderQuery: [
          {
            data: {
              currentSession: { id: 'bookmark-session-a', selectedProfile: bookmarkOwner },
              me: { id: 'bookmark-account', name: 'bookmark-account' },
            },
          },
          {
            data: {
              currentSession: { id: 'bookmark-session-b', selectedProfile: bookmarkOtherOwner },
              me: { id: 'bookmark-account', name: 'bookmark-account' },
            },
          },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('첫 번째로 저장한 게시글입니다.')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '프로필 전환' }));
    await expect(canvas.findByText('B 프로필로 저장한 게시글입니다.')).resolves.toBeVisible();
    expect(canvas.queryByText('첫 번째로 저장한 게시글입니다.')).not.toBeInTheDocument();
  },
  render: () => <ActorResetBookmarksRoute />,
};

export const ProtectedLayoutRedirectsGuestFromBookmarkPath: Story = {
  parameters: {
    relay: {
      operationResponses: {
        SessionProviderQuery: {
          data: { currentSession: null, me: null },
        },
      },
    },
    router: { pathname: '/bookmarks' },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).findByTestId('bookmark-route-pathname'),
    ).resolves.toHaveTextContent('/');
  },
  render: () => <GuestBookmarkRoute />,
};
