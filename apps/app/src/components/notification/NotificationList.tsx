import { usePathname, useSegments } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { graphql, useMutation, usePaginationFragment } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { getWebMobileShellHeader } from '@/components/shell/shellLayout';
import { Button } from '@/components/ui/Button';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import {
  FollowRequestNotificationListItem,
  NotificationListItem,
  ReactionNotificationListItem,
  ReplyNotificationListItem,
  RepostNotificationListItem,
} from './NotificationListItem';
import { NotificationReadAllAction, useNotificationReadAll } from './NotificationReadAllContext';
import type { NotificationList_profile$key } from './__generated__/NotificationList_profile.graphql';
import type { NotificationListMarkAllReadMutation } from './__generated__/NotificationListMarkAllReadMutation.graphql';
import type { NotificationListNextPageQuery } from './__generated__/NotificationListNextPageQuery.graphql';

type NotificationListProps = {
  profile: NotificationList_profile$key;
};

const notificationListMarkAllReadMutation = graphql`
  mutation NotificationListMarkAllReadMutation($ids: [ID!]!) {
    markNotificationRead(input: { ids: $ids }) {
      notifications {
        id
        readAt
      }
      recipientProfiles {
        id
        unreadNotificationCount
      }
    }
  }
`;

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
          readAt
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
  const { invoke, register } = useNotificationReadAll();
  const { showToast } = useToast();
  const [commitMarkAllRead, isMarkAllReadInFlight] =
    useMutation<NotificationListMarkAllReadMutation>(notificationListMarkAllReadMutation);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [readAllPending, setReadAllPending] = useState(false);
  const readAllInFlight = useRef(false);
  const mounted = useRef(false);
  const currentUnreadIds = useRef<ReadonlyArray<string>>([]);
  const unreadNotificationIds = pagination.data.notifications.edges.flatMap(({ node }) =>
    node.readAt === null ? [node.id] : [],
  );
  currentUnreadIds.current = unreadNotificationIds;
  const markAllRead = useCallback(() => {
    if (readAllInFlight.current || readAllPending || isMarkAllReadInFlight) {
      return;
    }

    const ids = currentUnreadIds.current;
    if (ids.length === 0) {
      return;
    }

    readAllInFlight.current = true;
    setReadAllPending(true);
    const handleFailure = () => {
      readAllInFlight.current = false;
      if (!mounted.current) {
        return;
      }
      setReadAllPending(false);
      showToast('알림을 모두 읽지 못했어요.', {
        action: { label: '다시 시도', onPress: invoke },
        tone: 'danger',
      });
    };
    commitMarkAllRead({
      onCompleted: (response, errors) => {
        if (errors?.length || response.markNotificationRead == null) {
          handleFailure();
          return;
        }
        readAllInFlight.current = false;
        if (mounted.current) {
          setReadAllPending(false);
        }
      },
      onError: handleFailure,
      variables: { ids: [...ids] },
    });
  }, [commitMarkAllRead, invoke, isMarkAllReadInFlight, readAllPending, showToast]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readAllInFlight.current = false;
    };
  }, []);

  useEffect(
    () =>
      register({
        busy: readAllPending || isMarkAllReadInFlight,
        disabled: readAllPending || isMarkAllReadInFlight || unreadNotificationIds.length === 0,
        onPress: markAllRead,
      }),
    [isMarkAllReadInFlight, markAllRead, readAllPending, register, unreadNotificationIds.length],
  );
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
        <StateView
          description="새로운 팔로우, 팔로우 요청, 답글, 반응 또는 재게시 알림이 생기면 여기에 표시돼요."
          style={styles.state}
          title="아직 알림이 없어요"
        />
      )}
      {pagination.hasNext || loadError ? (
        loadError ? (
          <StateView
            actionLabel="다시 시도"
            alert
            onAction={loadMore}
            style={[styles.pagination, { borderColor: theme.border }]}
            title="알림을 더 불러오지 못했어요"
          />
        ) : (
          <View style={[styles.pagination, { borderColor: theme.border }]}>
            <Button
              accessibilityState={{
                busy: pagination.isLoadingNext,
                disabled: pagination.isLoadingNext,
              }}
              disabled={pagination.isLoadingNext}
              onPress={loadMore}
              tone="secondary"
            >
              {pagination.isLoadingNext ? '불러오는 중' : '더 불러오기'}
            </Button>
          </View>
        )
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
                <Skeleton circular height={28} width={28} />
                <View style={styles.skeletonContent}>
                  <View style={styles.skeletonAvatarRow}>
                    <Skeleton circular height={28} width={28} />
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
        <StateView
          actionLabel={onRetry ? '다시 시도' : undefined}
          alert
          description="잠시 후 다시 시도해주세요."
          onAction={onRetry}
          style={styles.state}
          title="알림을 불러오지 못했어요"
        />
      ) : (
        <StateView
          description="알림을 보려면 사용할 프로필을 먼저 선택해주세요."
          style={styles.state}
          title="프로필이 필요해요"
        />
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

  return shellOwnsHeader ? null : (
    <PageHeader
      title="알림"
      trailing={Platform.OS === 'web' ? <NotificationReadAllAction /> : undefined}
    />
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
  pagination: { alignItems: 'center', borderTopWidth: 1, gap: spacing.md, padding: spacing.lg },
  skeletonItem: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
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
