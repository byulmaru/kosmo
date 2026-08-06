import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { HashtagRelatedProfileList_hashtag$key } from './__generated__/HashtagRelatedProfileList_hashtag.graphql';
import type { HashtagRelatedProfilesNextPageQuery } from './__generated__/HashtagRelatedProfilesNextPageQuery.graphql';

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
}: {
  hashtag: HashtagRelatedProfileList_hashtag$key;
}) {
  const pagination = usePaginationFragment<
    HashtagRelatedProfilesNextPageQuery,
    HashtagRelatedProfileList_hashtag$key
  >(hashtagRelatedProfileListFragment, hashtag);
  const theme = useTheme();
  const [loadError, setLoadError] = useState(false);
  const profiles = pagination.data.relatedProfiles.edges;
  const loadMore = () => {
    if (!pagination.hasNext || pagination.isLoadingNext) {
      return;
    }

    setLoadError(false);
    pagination.loadNext(20, {
      onComplete: (error) => setLoadError(Boolean(error)),
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <PageHeader title={`#${pagination.data.name} 관련 프로필`} />
      {profiles.length ? (
        profiles.map((edge) => <ProfileListItem key={edge.cursor} linked profile={edge.node} />)
      ) : (
        <StateView
          description="이 해시태그를 사용하는 공개 프로필이 생기면 여기에 표시돼요."
          title="관련 프로필이 없어요"
        />
      )}
      {pagination.hasNext || loadError ? (
        <View style={[styles.pagination, { borderColor: theme.border }]}>
          {loadError ? (
            <>
              <Text accessibilityRole="alert" style={[styles.stateTitle, { color: theme.text }]}>
                관련 프로필을 더 불러오지 못했어요
              </Text>
              <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
                잠시 후 다시 시도해주세요.
              </Text>
            </>
          ) : null}
          <Button
            accessibilityState={{
              busy: pagination.isLoadingNext,
              disabled: pagination.isLoadingNext,
            }}
            disabled={pagination.isLoadingNext}
            onPress={loadMore}
            style={styles.paginationAction}
            tone="secondary"
          >
            {pagination.isLoadingNext ? '불러오는 중' : loadError ? '다시 시도' : '더 불러오기'}
          </Button>
          {pagination.isLoadingNext ? (
            <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
              관련 프로필을 더 불러오는 중입니다.
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

export function HashtagRelatedProfileListState({
  onRetry,
  state,
}: {
  onRetry?: () => void;
  state: 'error' | 'loading' | 'notFound';
}) {
  return (
    <View>
      <PageHeader title="관련 프로필" />
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
  paginationAction: { marginTop: spacing.md },
  stateTitle: { fontFamily: 'SUIT', fontWeight: '700', textAlign: 'center', ...typography.md },
  stateDescription: {
    fontFamily: 'SUIT',
    marginTop: spacing.xs,
    textAlign: 'center',
    ...typography.sm,
  },
  srOnly: {
    height: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
