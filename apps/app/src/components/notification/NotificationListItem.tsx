import { Link } from 'expo-router';
import { Repeat2, Smile, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { NotificationListItem_notification$key } from './__generated__/NotificationListItem_notification.graphql';
import type { NotificationListItemMarkReadMutation } from './__generated__/NotificationListItemMarkReadMutation.graphql';
import type { ReactionNotificationListItem_notification$key } from './__generated__/ReactionNotificationListItem_notification.graphql';
import type { RepostNotificationListItem_notification$key } from './__generated__/RepostNotificationListItem_notification.graphql';

type NotificationListItemProps = {
  notification: NotificationListItem_notification$key;
};

type NotificationRowProps = {
  action: string;
  destination: string;
  href: Href;
  id: string;
  kind: 'follow' | 'reaction' | 'repost';
  name: string;
  readAt: string | null | undefined;
  timestamp: string;
};

const notificationFragment = graphql`
  fragment NotificationListItem_notification on FollowNotification {
    id
    createdAt
    readAt
    profile {
      displayName
      handle
      relativeHandle
    }
  }
`;

const notificationListItemMarkReadMutation = graphql`
  mutation NotificationListItemMarkReadMutation($id: ID!) {
    markNotificationRead(input: { id: $id }) {
      notification {
        id
        readAt
      }
      recipientProfile {
        id
        unreadNotificationCount
      }
    }
  }
`;

export function NotificationListItem({ notification }: NotificationListItemProps) {
  const data = useFragment(notificationFragment, notification);
  const name = data.profile.displayName || data.profile.handle;

  return (
    <NotificationRow
      action="팔로우했습니다"
      destination="프로필"
      href={`/${data.profile.relativeHandle}` as Href}
      id={data.id}
      kind="follow"
      name={name}
      readAt={data.readAt}
      timestamp={formatTimelineTimestamp(data.createdAt)}
    />
  );
}

const reactionNotificationFragment = graphql`
  fragment ReactionNotificationListItem_notification on ReactionNotification {
    id
    createdAt
    readAt
    type
    profile {
      displayName
      handle
    }
    post {
      id
      profile {
        relativeHandle
      }
    }
  }
`;

export function ReactionNotificationListItem({
  notification,
}: {
  notification: ReactionNotificationListItem_notification$key;
}) {
  const data = useFragment(reactionNotificationFragment, notification);
  const name = data.profile.displayName || data.profile.handle;

  return (
    <NotificationRow
      action={`${data.type} 반응을 남겼습니다`}
      destination="게시글"
      href={`/${data.post.profile.relativeHandle}/${data.post.id}` as Href}
      id={data.id}
      kind="reaction"
      name={name}
      readAt={data.readAt}
      timestamp={formatTimelineTimestamp(data.createdAt)}
    />
  );
}

const repostNotificationFragment = graphql`
  fragment RepostNotificationListItem_notification on RepostNotification {
    id
    createdAt
    readAt
    profile {
      displayName
      handle
    }
    post {
      id
      profile {
        relativeHandle
      }
    }
  }
`;

export function RepostNotificationListItem({
  notification,
}: {
  notification: RepostNotificationListItem_notification$key;
}) {
  const data = useFragment(repostNotificationFragment, notification);
  const name = data.profile.displayName || data.profile.handle;

  return (
    <NotificationRow
      action="게시물을 재게시했습니다"
      destination="게시글"
      href={`/${data.post.profile.relativeHandle}/${data.post.id}` as Href}
      id={data.id}
      kind="repost"
      name={name}
      readAt={data.readAt}
      timestamp={formatTimelineTimestamp(data.createdAt)}
    />
  );
}

function NotificationRow({
  action,
  destination,
  href,
  id,
  kind,
  name,
  readAt,
  timestamp,
}: NotificationRowProps) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  const [commitMarkRead] = useMutation<NotificationListItemMarkReadMutation>(
    notificationListItemMarkReadMutation,
  );
  const unread = readAt === null;
  const unreadDescription = unread ? ' 읽지 않은 알림.' : '';
  const markRead = () => {
    commitMarkRead({
      onError: () => undefined,
      variables: { id },
    });
  };

  return (
    <View
      onPointerEnter={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onPointerLeave={Platform.OS === 'web' ? () => setHovered(false) : undefined}
      style={[
        styles.root,
        {
          backgroundColor: hovered ? theme.surface : theme.card,
          borderColor: theme.border,
        },
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.kind, { backgroundColor: theme.primary }]}
      >
        {kind === 'follow' ? (
          <UserPlus color={theme.text} size={18} strokeWidth={2} />
        ) : kind === 'reaction' ? (
          <Smile color={theme.text} size={18} strokeWidth={2} />
        ) : (
          <Repeat2 color={theme.text} size={18} strokeWidth={2} />
        )}
      </View>
      <View style={styles.content}>
        <View style={styles.avatarRow}>
          <Link asChild href={href}>
            <Pressable
              accessibilityLabel={`${name} ${destination}로 이동.${unreadDescription}`}
              accessibilityRole="link"
              onPress={markRead}
              style={styles.avatarLink}
            >
              <Avatar label={name} size={28} />
            </Pressable>
          </Link>
          <Text style={[styles.time, { color: theme.textSecondary }]}>{timestamp}</Text>
        </View>
        <Link asChild href={href}>
          <Pressable
            accessibilityLabel={`${name}님이 ${action}. ${timestamp}.${unreadDescription} ${destination}로 이동`}
            accessibilityRole="link"
            onPress={markRead}
            style={styles.copyLink}
          >
            <Text style={[styles.copy, { color: theme.text }]}>
              <Text style={styles.name}>{name}</Text>님이 {action}
            </Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  content: { flex: 1, gap: spacing.sm, minWidth: 0 },
  kind: {
    alignItems: 'center',
    borderRadius: radii.full,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  avatarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 28,
    justifyContent: 'space-between',
  },
  avatarLink: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    margin: -spacing.sm,
    width: 44,
  },
  copyLink: {
    flex: 1,
    marginVertical: -spacing.md,
    minWidth: 0,
    paddingVertical: spacing.md,
  },
  copy: { fontFamily: 'SUIT', ...typography.sm },
  name: { fontFamily: 'SUIT', fontWeight: '700' },
  time: { fontFamily: 'SUIT', ...typography.xsm },
});
