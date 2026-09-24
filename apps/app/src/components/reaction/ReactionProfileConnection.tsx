import { graphql, usePaginationFragment } from 'react-relay';
import { usePaginationScrollRegistration } from '@/components/pagination/PaginationScrollView';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
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
  presentation?: 'modal' | 'route';
  reactionType: string;
};

export function ReactionProfileConnection({
  post,
  presentation,
  reactionType,
}: ReactionProfileConnectionProps) {
  const pagination = usePaginationFragment<
    ReactionProfileConnectionNextPageQuery,
    ReactionProfileConnection_post$key
  >(reactionProfileConnectionFragment, post);
  const items = pagination.data.reactionProfiles.edges.map(({ cursor, node }) => ({
    id: cursor,
    profile: node,
  }));
  const { endRef, loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: items.length,
    loadNext: pagination.loadNext,
    pageSize: 20,
  });
  usePaginationScrollRegistration(nativeScrollProps);

  return (
    <ReactionProfileList
      hasNext={pagination.hasNext}
      paginationEndRef={endRef}
      isLoadingMore={pagination.isLoadingNext}
      items={items}
      loadMoreError={loadError}
      onLoadMore={loadNextPage}
      presentation={presentation}
      reactionType={reactionType}
    />
  );
}
