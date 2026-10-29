import { StyleSheet, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { usePaginationScrollRegistration } from '@/components/pagination/PaginationScrollView';
import { PaginationSurface } from '@/components/pagination/PaginationSurface';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { StateView } from '@/components/ui/StateView';
import { spacing } from '@/theme/tokens';
import type { PostRepostProfileList_post$key } from './__generated__/PostRepostProfileList_post.graphql';
import type { PostRepostProfileListNextPageQuery } from './__generated__/PostRepostProfileListNextPageQuery.graphql';

const postRepostProfileListFragment = graphql`
  fragment PostRepostProfileList_post on Post
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostRepostProfileListNextPageQuery") {
    repostProfiles(first: $count, after: $cursor)
      @connection(key: "PostRepostProfileList_repostProfiles") {
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

export function PostRepostProfileList({
  post: postKey,
}: Readonly<{ post: PostRepostProfileList_post$key }>) {
  const pagination = usePaginationFragment<
    PostRepostProfileListNextPageQuery,
    PostRepostProfileList_post$key
  >(postRepostProfileListFragment, postKey);
  const connection = pagination.data.repostProfiles;
  const { endRef, loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: connection?.edges.length ?? 0,
    loadNext: pagination.loadNext,
    pageSize: 20,
  });
  usePaginationScrollRegistration(nativeScrollProps);

  if (!connection) {
    return (
      <StateView
        description="이 게시글의 게시 활동을 확인할 수 없어요."
        title="게시 활동을 볼 수 없어요"
      />
    );
  }

  return connection.edges.length ? (
    <View style={styles.root}>
      {connection.edges.map(({ cursor, node }) => (
        <ProfileListItem key={cursor} linked profile={node} showBio={false} />
      ))}
      <PaginationSurface
        endRef={endRef}
        error={loadError}
        errorMessage="게시 활동을 더 불러오지 못했어요"
        hasNext={pagination.hasNext}
        isLoading={pagination.isLoadingNext}
        loadingLabel="게시 활동을 더 불러오는 중"
        onRetry={loadNextPage}
        style={styles.pagination}
      />
    </View>
  ) : (
    <StateView
      description="이 게시글을 재게시한 프로필이 생기면 여기에 표시돼요."
      title="아직 게시 활동이 없어요"
    />
  );
}

const styles = StyleSheet.create({
  pagination: { paddingVertical: spacing.md },
  root: { paddingHorizontal: spacing.lg },
});
