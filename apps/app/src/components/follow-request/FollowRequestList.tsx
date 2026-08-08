import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { ConnectionHandler } from 'relay-runtime';
import { PageHeader } from '@/components/PageHeader';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { FollowRequestListItem } from './FollowRequestListItem';
import type { FollowRequestList_profile$key } from './__generated__/FollowRequestList_profile.graphql';
import type { FollowRequestListNextPageQuery } from './__generated__/FollowRequestListNextPageQuery.graphql';

type FollowRequestListProps = {
  profile: FollowRequestList_profile$key;
};

const followRequestListFragment = graphql`
  fragment FollowRequestList_profile on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "FollowRequestListNextPageQuery") {
    id
    incomingProfileFollowRequests(first: $count, after: $cursor)
      @connection(key: "FollowRequestList_incomingProfileFollowRequests") {
      edges {
        cursor
        node {
          id
          ...FollowRequestListItem_request
        }
      }
    }
  }
`;

export function FollowRequestList({ profile }: FollowRequestListProps) {
  const theme = useTheme();
  const pagination = usePaginationFragment<
    FollowRequestListNextPageQuery,
    FollowRequestList_profile$key
  >(followRequestListFragment, profile);
  const connection = pagination.data.incomingProfileFollowRequests;
  const edges = connection?.edges ?? [];
  const connectionId = ConnectionHandler.getConnectionID(
    pagination.data.id,
    'FollowRequestList_incomingProfileFollowRequests',
  );
  const { loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext: pagination.hasNext,
    isLoadingNext: pagination.isLoadingNext,
    itemCount: edges.length,
    loadNext: pagination.loadNext,
    pageSize: 20,
  });

  if (!connection) {
    throw new Error('Selected Profile incoming follow request connection is unavailable.');
  }

  return (
    <ScrollView
      {...(Platform.OS === 'web' ? {} : nativeScrollProps)}
      contentContainerStyle={styles.root}
    >
      <PageHeader title="팔로워 요청" />
      {edges.length ? (
        edges.map(({ node }) => (
          <FollowRequestListItem connectionId={connectionId} key={node.id} request={node} />
        ))
      ) : (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>받은 팔로우 요청이 없어요</Text>
          <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
            새 요청이 들어오면 여기에 표시돼요.
          </Text>
        </View>
      )}
      {pagination.isLoadingNext ? (
        <View style={[styles.pagination, { borderColor: theme.border }]}>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.stateDescription, { color: theme.textSecondary }]}
          >
            팔로워 요청을 더 불러오는 중입니다.
          </Text>
        </View>
      ) : loadError ? (
        <View accessibilityRole="alert" style={[styles.pagination, { borderColor: theme.border }]}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>
            팔로워 요청을 더 불러오지 못했어요
          </Text>
          <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
            이미 불러온 요청은 그대로 유지돼요.
          </Text>
          <Button onPress={loadNextPage} style={styles.stateAction} tone="secondary">
            다시 시도
          </Button>
        </View>
      ) : null}
    </ScrollView>
  );
}

export function FollowRequestListState({
  onRetry,
  state,
}: {
  onRetry?: () => void;
  state: 'error' | 'loading' | 'profileRequired';
}) {
  const theme = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <PageHeader title="팔로워 요청" />
      {state === 'loading' ? (
        <>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[0, 1, 2].map((item) => (
              <View key={item} style={[styles.skeletonItem, { borderColor: theme.border }]}>
                <View
                  style={[
                    styles.avatarSkeleton,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                />
                <View style={styles.skeletonCopy}>
                  <Skeleton height={12} width={160} />
                  <Skeleton height={12} width={80} />
                </View>
              </View>
            ))}
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
            팔로워 요청을 불러오는 중입니다.
          </Text>
        </>
      ) : state === 'error' ? (
        <View accessibilityRole="alert" style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>
            팔로워 요청을 불러오지 못했어요
          </Text>
          <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
            잠시 후 다시 시도해주세요.
          </Text>
          {onRetry ? (
            <Button onPress={onRetry} style={styles.stateAction} tone="secondary">
              다시 시도
            </Button>
          ) : null}
        </View>
      ) : (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>프로필이 필요해요</Text>
          <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
            팔로워 요청을 보려면 사용할 프로필을 먼저 선택해주세요.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingBottom: spacing.xxxl },
  state: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxxl,
  },
  stateTitle: { fontFamily: 'SUIT', fontWeight: '700', textAlign: 'center', ...typography.md },
  stateDescription: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
  stateAction: { marginTop: spacing.md },
  pagination: {
    alignItems: 'center',
    borderTopWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  skeletonItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  avatarSkeleton: { borderRadius: radii.full, borderWidth: 1, height: 40, width: 40 },
  skeletonCopy: { flex: 1, gap: spacing.sm, minWidth: 0 },
  srOnly: {
    height: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
