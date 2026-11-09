import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery, usePaginationFragment } from 'react-relay';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostComposerCoordinatorProvider } from '@/components/post/PostComposerCoordinator';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { getShellLayout } from '@/components/shell/shellLayout';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes, spacing, textStyles } from '@/theme/tokens';
import { PostListItem } from '../post/PostListItem';
import { postListMetrics } from '../post/postListMetrics';
import type { PostListPresentation } from '../post/postListMetrics';
import type { SettingsSmartFilterResults_query$key } from './__generated__/SettingsSmartFilterResults_query.graphql';
import type { SettingsSmartFilterResultsNextPageQuery } from './__generated__/SettingsSmartFilterResultsNextPageQuery.graphql';
import type { SettingsSmartFilterResultsQuery } from './__generated__/SettingsSmartFilterResultsQuery.graphql';

const PAGE_SIZE = 20;
const exclusionThreshold = 0.8;

const query = graphql`
  query SettingsSmartFilterResultsQuery {
    currentSession {
      selectedProfile {
        ...ReplyComposerSurface_profile
      }
    }
    ...SettingsSmartFilterResults_query @arguments(count: 20)
  }
`;

const resultsFragment = graphql`
  fragment SettingsSmartFilterResults_query on Query
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "SettingsSmartFilterResultsNextPageQuery") {
    homeTimeline(first: $count, after: $cursor, ignoreSmartFilter: true)
      @connection(key: "SettingsSmartFilterResults_homeTimeline", filters: ["ignoreSmartFilter"]) {
      edges {
        cursor
        node {
          id
          smartFilterProbability
          ...PostListItem_post
        }
      }
    }
  }
`;

export function SettingsSmartFilterResults() {
  const isFocused = useIsFocused();

  return isFocused ? <FocusedSettingsSmartFilterResults /> : null;
}

function FocusedSettingsSmartFilterResults() {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.root}>
      {revealed ? (
        <RouteBoundary
          loading={<StateView loading title="판정 결과를 불러오는 중입니다." />}
          title="판정 결과를 불러오지 못했어요"
        >
          <SettingsSmartFilterResultsContent />
        </RouteBoundary>
      ) : (
        <View style={styles.reveal}>
          <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
            보고 싶지 않은 내용이 포함될 수 있어요.
          </Text>
          <Button onPress={() => setRevealed(true)}>판정 결과 보기</Button>
        </View>
      )}
    </View>
  );
}

function SettingsSmartFilterResultsContent() {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<SettingsSmartFilterResultsQuery>(
    query,
    {},
    { fetchKey, fetchPolicy: 'network-only' },
  );

  const replyProfile = data.currentSession?.selectedProfile ?? null;

  return (
    <PostActionAuthenticationProvider>
      <PostComposerCoordinatorProvider owner="list" profile={replyProfile}>
        <PostMediaViewerHostProvider>
          <SettingsSmartFilterResultsList query={data} />
        </PostMediaViewerHostProvider>
      </PostComposerCoordinatorProvider>
    </PostActionAuthenticationProvider>
  );
}

function SettingsSmartFilterResultsList({
  query: queryKey,
}: {
  query: SettingsSmartFilterResults_query$key;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const presentation: PostListPresentation =
    getShellLayout(Platform.OS === 'web', width) === 'mobile' ? 'mobile' : 'wide';
  const pagination = usePaginationFragment<
    SettingsSmartFilterResultsNextPageQuery,
    SettingsSmartFilterResults_query$key
  >(resultsFragment, queryKey);
  const [loadError, setLoadError] = useState(false);
  const edges = pagination.data.homeTimeline?.edges ?? [];
  const visibleResults = edges.flatMap((edge) => {
    const post = edge.node;
    const probability = post?.smartFilterProbability;
    return post && probability != null ? [{ cursor: edge.cursor, post, probability }] : [];
  });

  const loadNextPage = () => {
    if (!pagination.hasNext || pagination.isLoadingNext) {
      return;
    }

    setLoadError(false);
    pagination.loadNext(PAGE_SIZE, {
      onComplete: (error) => setLoadError(Boolean(error)),
    });
  };

  return (
    <View style={styles.results}>
      {visibleResults.map(({ cursor, post, probability }) => {
        const excluded = probability >= exclusionThreshold;
        const percentage = `${Math.floor(probability * 1000) / 10}%`;

        return (
          <View key={cursor}>
            <View
              style={[
                styles.metadata,
                {
                  backgroundColor: theme.backgroundCanvas,
                  paddingHorizontal: postListMetrics[presentation].inset,
                },
              ]}
            >
              <Text style={[textStyles.uiLabelS, { color: theme.foregroundSecondary }]}>
                {excluded ? '제외' : '통과'}
              </Text>
              <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
                조건 일치 확률 {percentage}
              </Text>
            </View>
            <PostListItem post={post} presentation={presentation} />
          </View>
        );
      })}
      {visibleResults.length === 0 &&
      !pagination.hasNext &&
      !pagination.isLoadingNext &&
      !loadError ? (
        <StateView title="판정 결과가 없어요" />
      ) : null}
      {loadError ? (
        <StateView
          actionLabel="다시 시도"
          alert
          onAction={loadNextPage}
          style={styles.paginationState}
          title="판정 결과를 더 불러오지 못했어요"
        />
      ) : pagination.hasNext ? (
        <View style={styles.pagination}>
          <Button
            accessibilityState={{
              busy: pagination.isLoadingNext,
              disabled: pagination.isLoadingNext,
            }}
            disabled={pagination.isLoadingNext}
            loading={pagination.isLoadingNext}
            loadingText="불러오는 중"
            onPress={loadNextPage}
          >
            더 보기
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  reveal: { ...layoutRecipes.formStack, padding: spacing.lg },
  results: { width: '100%' },
  metadata: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  pagination: { alignItems: 'center', padding: spacing.lg },
  paginationState: { padding: spacing.lg },
});
