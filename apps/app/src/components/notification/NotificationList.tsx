import { useState, useTransition } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { NotificationListItem } from './NotificationListItem';
import type { NotificationList_profile$key } from './__generated__/NotificationList_profile.graphql';
import type { NotificationListNextPageQuery } from './__generated__/NotificationListNextPageQuery.graphql';

type NotificationListProps = {
  profile: NotificationList_profile$key;
};

const notificationListFragment = graphql`
  fragment NotificationList_profile on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "NotificationListNextPageQuery") {
    notifications(first: $count, after: $cursor)
      @connection(key: "NotificationList_notifications") {
      edges {
        cursor
        node {
          id
          __typename
          ... on FollowNotification {
            ...NotificationListItem_notification @alias(as: "follow")
          }
        }
      }
    }
  }
`;

export function NotificationList({ profile }: NotificationListProps) {
  const theme = useTheme();
  const pagination = usePaginationFragment<
    NotificationListNextPageQuery,
    NotificationList_profile$key
  >(notificationListFragment, profile);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [, startTransition] = useTransition();
  const notifications = pagination.data.notifications.edges.flatMap(({ node }) =>
    node.__typename === 'FollowNotification' && node.follow
      ? [{ ...node, follow: node.follow }]
      : [],
  );

  const loadMore = () => {
    if (pagination.isLoadingNext) {
      return;
    }

    setLoadError(false);
    pagination.loadNext(20, { onComplete: (error) => setLoadError(Boolean(error)) });
  };

  const refresh = () => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    startTransition(() => {
      pagination.refetch(
        { count: 20 },
        {
          fetchPolicy: 'network-only',
          onComplete: () => {
            setRefreshing(false);
          },
        },
      );
    });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      refreshControl={
        Platform.OS === 'web' ? undefined : (
          <RefreshControl onRefresh={refresh} refreshing={refreshing} tintColor={theme.text} />
        )
      }
    >
      <View style={styles.heading}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>KOSMO</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            알림
          </Text>
        </View>
        {Platform.OS === 'web' ? (
          <Button
            accessibilityState={{ busy: refreshing, disabled: refreshing }}
            disabled={refreshing}
            onPress={refresh}
            tone="secondary"
          >
            {refreshing ? '새로고침 중' : '새로고침'}
          </Button>
        ) : null}
      </View>
      <Text
        accessibilityRole="header"
        style={[styles.sectionTitle, { borderColor: theme.border, color: theme.text }]}
      >
        모두
      </Text>
      {notifications.length ? (
        notifications.map((notification) => (
          <NotificationListItem key={notification.id} notification={notification.follow} />
        ))
      ) : (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>아직 알림이 없어요</Text>
          <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
            새로운 팔로우 알림이 생기면 여기에 표시돼요.
          </Text>
        </View>
      )}
      {pagination.hasNext || loadError ? (
        <View style={[styles.pagination, { borderColor: theme.border }]}>
          {loadError ? (
            <Text accessibilityRole="alert" style={[styles.stateTitle, { color: theme.text }]}>
              알림을 더 불러오지 못했어요
            </Text>
          ) : null}
          <Button
            accessibilityState={{
              busy: pagination.isLoadingNext,
              disabled: pagination.isLoadingNext,
            }}
            disabled={pagination.isLoadingNext}
            onPress={loadMore}
            tone="secondary"
          >
            {pagination.isLoadingNext ? '불러오는 중' : loadError ? '다시 시도' : '더 불러오기'}
          </Button>
        </View>
      ) : null}
    </ScrollView>
  );
}

export function NotificationListState({
  onRetry,
  state,
}: {
  onRetry?: () => void;
  state: 'error' | 'loading' | 'profileRequired';
}) {
  const theme = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.heading}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>KOSMO</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            알림
          </Text>
        </View>
      </View>
      <Text
        accessibilityRole="header"
        style={[styles.sectionTitle, { borderColor: theme.border, color: theme.text }]}
      >
        모두
      </Text>
      {state === 'loading' ? (
        <>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[0, 1, 2].map((item) => (
              <View key={item} style={[styles.skeletonItem, { borderColor: theme.border }]}>
                <View style={[styles.kindSkeleton, { backgroundColor: theme.surface }]} />
                <View style={[styles.avatarSkeleton, { backgroundColor: theme.surface }]} />
                <View style={styles.skeletonCopy}>
                  <Skeleton height={12} width="80%" />
                  <Skeleton height={12} width={72} />
                </View>
              </View>
            ))}
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
            알림을 불러오는 중입니다.
          </Text>
        </>
      ) : state === 'error' ? (
        <View accessibilityRole="alert" style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>알림을 불러오지 못했어요</Text>
          <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
            잠시 후 다시 시도해주세요.
          </Text>
          {onRetry ? (
            <Button onPress={onRetry} tone="secondary">
              다시 시도
            </Button>
          ) : null}
        </View>
      ) : (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>프로필이 필요해요</Text>
          <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
            알림을 보려면 사용할 프로필을 먼저 선택해주세요.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingBottom: spacing.xxxl },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  eyebrow: {
    fontFamily: 'SUIT',
    fontWeight: '600',
    letterSpacing: 1.6,
    marginBottom: spacing.sm,
    ...typography.xsm,
  },
  title: { fontFamily: 'SUIT', fontSize: 36, fontWeight: '700', lineHeight: 40 },
  sectionTitle: {
    borderBottomWidth: 1,
    fontFamily: 'SUIT',
    fontWeight: '700',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    ...typography.md,
  },
  state: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxxl,
  },
  stateTitle: { fontFamily: 'SUIT', fontWeight: '700', textAlign: 'center', ...typography.md },
  stateDescription: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
  pagination: { alignItems: 'center', borderTopWidth: 1, gap: spacing.md, padding: spacing.lg },
  skeletonItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  kindSkeleton: { borderRadius: radii.full, height: 32, width: 32 },
  avatarSkeleton: { borderRadius: radii.full, height: 40, width: 40 },
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
