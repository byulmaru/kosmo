import { useState } from 'react';
import { Text } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import { BookmarkList } from '@/components/bookmark/BookmarkList';
import { post, profile } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { BookmarksStoriesQuery as BookmarksStoriesQueryType } from './__generated__/BookmarksStoriesQuery.graphql';

const author = profile({
  displayName: '우주 기록자',
  handle: 'space-writer',
  id: 'bookmark-author',
  relativeHandle: '@space-writer',
});
const targetPosts = [
  post({ bodyText: '첫 번째로 저장한 게시글입니다.', id: 'bookmark-target-1', profile: author }),
  post({ bodyText: '두 번째로 저장한 게시글입니다.', id: 'bookmark-target-2', profile: author }),
];

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
    expect(canvas.getAllByRole('heading', { name: '북마크' })).toHaveLength(4);
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
