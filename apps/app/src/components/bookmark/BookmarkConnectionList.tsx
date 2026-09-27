import { graphql, usePaginationFragment } from 'react-relay';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { BookmarkList } from './BookmarkList';
import type { BookmarkConnectionList_profile$key } from './__generated__/BookmarkConnectionList_profile.graphql';
import type { BookmarkConnectionListNextPageQuery } from './__generated__/BookmarkConnectionListNextPageQuery.graphql';

const bookmarkConnectionFragment = graphql`
  fragment BookmarkConnectionList_profile on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "BookmarkConnectionListNextPageQuery") {
    id
    ...ReplyComposerSurface_profile
    bookmarks(first: $count, after: $cursor) @connection(key: "BookmarkConnectionList_bookmarks") {
      edges {
        node {
          id
          post {
            ...PostListItem_post @alias(as: "listItem")
          }
        }
      }
    }
  }
`;

type BookmarkConnectionListProps = {
  profile: BookmarkConnectionList_profile$key;
};

export function BookmarkConnectionList({ profile }: BookmarkConnectionListProps) {
  const pagination = usePaginationFragment<
    BookmarkConnectionListNextPageQuery,
    BookmarkConnectionList_profile$key
  >(bookmarkConnectionFragment, profile);
  const items = pagination.data.bookmarks.edges.flatMap(({ node }) =>
    node.post?.listItem ? [{ id: node.id, post: node.post.listItem }] : [],
  );
  const { endRef, loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: items.length,
    loadNext: pagination.loadNext,
    pageSize: 20,
    webScrollTarget: 'container',
  });
  return (
    <BookmarkList
      error={loadError}
      endRef={endRef}
      hasNext={pagination.hasNext}
      isLoadingMore={pagination.isLoadingNext}
      items={items}
      onRetry={loadNextPage}
      replyProfile={pagination.data}
      scrollProps={nativeScrollProps}
    />
  );
}
