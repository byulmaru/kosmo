import { Link } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { NotificationListItem_notification$key } from './__generated__/NotificationListItem_notification.graphql';

type NotificationListItemProps = {
  notification: NotificationListItem_notification$key;
};

const notificationFragment = graphql`
  fragment NotificationListItem_notification on FollowNotification {
    createdAt
    readAt
    profile {
      displayName
      handle
      relativeHandle
    }
  }
`;

export function NotificationListItem({ notification }: NotificationListItemProps) {
  const theme = useTheme();
  const data = useFragment(notificationFragment, notification);
  const name = data.profile.displayName || data.profile.handle;
  const profileHref = `/${data.profile.relativeHandle}` as Href;
  const timestamp = formatTimelineTimestamp(data.createdAt);
  const unread = data.readAt === null;
  const actionLabel = `${name}님이 팔로우했습니다. ${timestamp}.${unread ? ' 읽지 않은 알림.' : ''} 프로필로 이동`;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: unread ? theme.surface : theme.card,
          borderColor: theme.border,
        },
      ]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.kind, { backgroundColor: theme.primary }]}
      >
        <UserPlus color={theme.text} size={18} strokeWidth={2} />
      </View>
      <Link asChild href={profileHref}>
        <Pressable
          accessibilityLabel={`${name} 프로필로 이동`}
          accessibilityRole="link"
          style={styles.avatarLink}
        >
          <Avatar label={name} size={40} />
        </Pressable>
      </Link>
      <Link asChild href={profileHref}>
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="link"
          style={styles.copyLink}
        >
          <Text style={[styles.copy, { color: theme.text }]}>
            <Text style={styles.name}>{name}</Text>님이 팔로우했습니다
          </Text>
          <Text style={[styles.time, { color: theme.textSecondary }]}>{timestamp}</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  kind: {
    alignItems: 'center',
    borderRadius: radii.full,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  avatarLink: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  copyLink: { flex: 1, justifyContent: 'center', minHeight: 44, minWidth: 0 },
  copy: { fontFamily: 'SUIT', ...typography.sm },
  name: { fontFamily: 'SUIT', fontWeight: '700' },
  time: { fontFamily: 'SUIT', marginTop: spacing.xs, ...typography.xsm },
});
