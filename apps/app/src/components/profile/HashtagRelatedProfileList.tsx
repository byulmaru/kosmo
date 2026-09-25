import { ScrollView, StyleSheet, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PaginationSurface } from '@/components/pagination/PaginationSurface';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { HashtagRelatedProfileList_hashtag$key } from './__generated__/HashtagRelatedProfileList_hashtag.graphql';
import type { HashtagRelatedProfilesNextPageQuery } from './__generated__/HashtagRelatedProfilesNextPageQuery.graphql';
import type { ReactNode } from 'react';

const hashtagRelatedProfileListFragment = graphql`
  fragment HashtagRelatedProfileList_hashtag on Hashtag
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "HashtagRelatedProfilesNextPageQuery") {
    id
    name
    relatedProfiles(first: $count, after: $cursor)
      @connection(key: "HashtagRelatedProfileList_relatedProfiles") {
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

export function HashtagRelatedProfileList({
  hashtag,
  leading,
}: {
  hashtag: HashtagRelatedProfileList_hashtag$key;
  leading?: ReactNode;
}) {
  const pagination = usePaginationFragment<
    HashtagRelatedProfilesNextPageQuery,
    HashtagRelatedProfileList_hashtag$key
  >(hashtagRelatedProfileListFragment, hashtag);
  const theme = useTheme();
  const profiles = pagination.data.relatedProfiles.edges;
  const { endRef, loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: profiles.length,
    loadNext: pagination.loadNext,
    pageSize: 20,
    webScrollTarget: 'container',
  });

  return (
    <ScrollView {...nativeScrollProps} contentContainerStyle={styles.root}>
      <PageHeader leading={leading} title={`#${pagination.data.name} 관련 프로필`} />
      {profiles.length ? (
        profiles.map((edge) => (
          <ProfileListItem key={edge.cursor} linked profile={edge.node} showBio />
        ))
      ) : (
        <StateView
          description="이 해시태그를 사용하는 공개 프로필이 생기면 여기에 표시돼요."
          title="관련 프로필이 없어요"
        />
      )}
      <PaginationSurface
        endRef={endRef}
        error={loadError}
        errorMessage="관련 프로필을 더 불러오지 못했어요"
        hasNext={pagination.hasNext}
        isLoading={pagination.isLoadingNext}
        loadingLabel="관련 프로필을 더 불러오는 중"
        onRetry={loadNextPage}
        style={[styles.pagination, { borderColor: theme.border }]}
      />
    </ScrollView>
  );
}

export function HashtagRelatedProfileListState({
  leading,
  onRetry,
  state,
}: {
  leading?: ReactNode;
  onRetry?: () => void;
  state: 'error' | 'loading' | 'notFound';
}) {
  return (
    <View>
      <PageHeader leading={leading} title="관련 프로필" />
      {state === 'loading' ? (
        <StateView loading title="관련 프로필을 불러오는 중입니다." />
      ) : state === 'error' ? (
        <StateView
          actionLabel={onRetry ? '다시 시도' : undefined}
          alert
          description="잠시 후 다시 시도해주세요."
          onAction={onRetry}
          title="관련 프로필을 불러오지 못했어요"
        />
      ) : (
        <StateView
          description="존재하지 않거나 삭제된 해시태그예요."
          title="해시태그를 찾을 수 없어요"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingBottom: spacing.xxxl },
  pagination: { alignItems: 'center', borderTopWidth: 1, padding: spacing.lg },
});
