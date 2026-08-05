import { usePathname, useSegments } from 'expo-router';
import { useState, useTransition } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { getWebMobileShellHeader } from '@/components/shell/shellLayout';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import {
  FollowRequestNotificationListItem,
  NotificationListItem,
  ReactionNotificationListItem,
  ReplyNotificationListItem,
  RepostNotificationListItem,
} from './NotificationListItem';
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
          ... on FollowRequestNotification {
            ...FollowRequestNotificationListItem_notification @alias(as: "followRequest")
          }
          ... on ReactionNotification {
            ...ReactionNotificationListItem_notification @alias(as: "reaction")
          }
          ... on ReplyNotification {
            ...ReplyNotificationListItem_notification @alias(as: "reply")
          }
          ... on RepostNotification {
            ...RepostNotificationListItem_notification @alias(as: "repost")
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
  const [refreshing, startTransition] = useTransition();
  const notifications = pagination.data.notifications.edges.flatMap(({ node }) => {
    if (node.__typename === 'FollowNotification' && node.follow) {
      return <NotificationListItem key={node.id} notification={node.follow} />;
    }
    if (node.__typename === 'FollowRequestNotification' && node.followRequest) {
      return <FollowRequestNotificationListItem key={node.id} notification={node.followRequest} />;
    }
    if (node.__typename === 'ReactionNotification' && node.reaction) {
      return <ReactionNotificationListItem key={node.id} notification={node.reaction} />;
    }
    if (node.__typename === 'ReplyNotification' && node.reply) {
      return <ReplyNotificationListItem key={node.id} notification={node.reply} />;
    }
    if (node.__typename === 'RepostNotification' && node.repost) {
      return <RepostNotificationListItem key={node.id} notification={node.repost} />;
    }
    return [];
  });

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

    startTransition(() => {
      pagination.refetch(
        { count: 20 },
        {
          fetchPolicy: 'network-only',
          onComplete: (error) => {
            setLoadError((current) => (error ? current : false));
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
      <NotificationPageHeader />
      {notifications.length ? (
        notifications
      ) : (
        <View style={styles.state}>
          <Text style={[styles.stateTitle, { color: theme.text }]}>아직 알림이 없어요</Text>
          <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>
            새로운 팔로우, 팔로우 요청, 답글, 반응 또는 재게시 알림이 생기면 여기에 표시돼요.
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
      <NotificationPageHeader />
      {state === 'loading' ? (
        <>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[0, 1, 2].map((item) => (
              <View key={item} style={[styles.skeletonItem, { borderColor: theme.border }]}>
                <View style={[styles.kindSkeleton, { backgroundColor: theme.surface }]} />
                <View style={styles.skeletonContent}>
                  <View style={styles.skeletonAvatarRow}>
                    <View style={[styles.avatarSkeleton, { backgroundColor: theme.surface }]} />
                    <Skeleton height={12} width={48} />
                  </View>
                  <View style={styles.skeletonCopy}>
                    <Skeleton height={12} width="80%" />
                  </View>
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

function NotificationPageHeader() {
  const pathname = usePathname();
  const routeSegments = useSegments();
  const { width } = useWindowDimensions();
  const shellOwnsHeader =
    getWebMobileShellHeader(Platform.OS === 'web', width, pathname, routeSegments)?.title ===
    '알림';

  return shellOwnsHeader ? null : <PageHeader title="알림" />;
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
  pagination: { alignItems: 'center', borderTopWidth: 1, gap: spacing.md, padding: spacing.lg },
  skeletonItem: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  kindSkeleton: { borderRadius: radii.full, height: 28, width: 28 },
  avatarSkeleton: { borderRadius: radii.full, height: 28, width: 28 },
  skeletonAvatarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 28,
    justifyContent: 'space-between',
  },
  skeletonContent: { flex: 1, gap: spacing.sm, minWidth: 0 },
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
