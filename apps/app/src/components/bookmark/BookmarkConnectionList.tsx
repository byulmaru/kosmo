import { useEffect, useRef, useState } from 'react';
import { graphql, usePaginationFragment } from 'react-relay';
import { BookmarkList } from './BookmarkList';
import type { BookmarkConnectionList_profile$key } from './__generated__/BookmarkConnectionList_profile.graphql';
import type { BookmarkConnectionListNextPageQuery } from './__generated__/BookmarkConnectionListNextPageQuery.graphql';

const bookmarkConnectionFragment = graphql`
  fragment BookmarkConnectionList_profile on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "BookmarkConnectionListNextPageQuery") {
    id
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
  const profileId = pagination.data.id;
  const [loadError, setLoadError] = useState(false);
  const profileIdRef = useRef(profileId);
  profileIdRef.current = profileId;
  useEffect(() => {
    setLoadError(false);
  }, [profileId]);
  const items = pagination.data.bookmarks.edges.flatMap(({ node }) =>
    node.post?.listItem ? [{ id: node.id, post: node.post.listItem }] : [],
  );

  const loadMore = () => {
    if (pagination.isLoadingNext) {
      return;
    }
    setLoadError(false);
    pagination.loadNext(20, {
      onComplete: (error) => {
        if (profileIdRef.current === profileId) {
          setLoadError(Boolean(error));
        }
      },
    });
  };

  return (
    <BookmarkList
      error={loadError}
      hasNext={pagination.hasNext}
      isLoadingMore={pagination.isLoadingNext}
      items={items}
      onLoadMore={loadMore}
      onRetry={loadMore}
    />
  );
}
