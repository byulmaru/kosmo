import { useEffect, useRef, useState } from 'react';
import { graphql, usePaginationFragment } from 'react-relay';
import { ReactionProfileList } from './ReactionProfileList';
import type { ReactionProfileConnection_post$key } from './__generated__/ReactionProfileConnection_post.graphql';
import type { ReactionProfileConnectionNextPageQuery } from './__generated__/ReactionProfileConnectionNextPageQuery.graphql';

const reactionProfileConnectionFragment = graphql`
  fragment ReactionProfileConnection_post on Post
  @argumentDefinitions(
    count: { type: "Int", defaultValue: 20 }
    cursor: { type: "String" }
    reactionType: { type: "String!" }
  )
  @refetchable(queryName: "ReactionProfileConnectionNextPageQuery") {
    id
    reactionProfiles(type: $reactionType, first: $count, after: $cursor)
      @connection(key: "ReactionProfileConnection_reactionProfiles", filters: ["type"]) {
      edges {
        cursor
        node {
          id
          ...ProfileListItem_profile
        }
      }
    }
  }
`;

type ReactionProfileConnectionProps = {
  post: ReactionProfileConnection_post$key;
  reactionType: string;
};

export function ReactionProfileConnection({ post, reactionType }: ReactionProfileConnectionProps) {
  const pagination = usePaginationFragment<
    ReactionProfileConnectionNextPageQuery,
    ReactionProfileConnection_post$key
  >(reactionProfileConnectionFragment, post);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const scope = `${pagination.data.id}:${reactionType}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    setLoadMoreError(false);
  }, [scope]);

  const loadMore = () => {
    if (pagination.isLoadingNext) {
      return;
    }

    setLoadMoreError(false);
    pagination.loadNext(20, {
      onComplete: (error) => {
        if (scopeRef.current === scope) {
          setLoadMoreError(Boolean(error));
        }
      },
    });
  };

  const items = pagination.data.reactionProfiles.edges.map(({ cursor, node }) => ({
    id: cursor,
    profile: node,
  }));

  return (
    <ReactionProfileList
      hasNext={pagination.hasNext}
      isLoadingMore={pagination.isLoadingNext}
      items={items}
      loadMoreError={loadMoreError}
      onLoadMore={loadMore}
      reactionType={reactionType}
    />
  );
}
