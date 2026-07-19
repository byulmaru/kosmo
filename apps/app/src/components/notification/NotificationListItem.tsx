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
      <View style={styles.content}>
        <View style={styles.avatarRow}>
          <Link asChild href={profileHref}>
            <Pressable
              accessibilityLabel={`${name} 프로필로 이동`}
              accessibilityRole="link"
              style={styles.avatarLink}
            >
              <Avatar label={name} size={28} />
            </Pressable>
          </Link>
          <Text style={[styles.time, { color: theme.textSecondary }]}>{timestamp}</Text>
        </View>
        <Link asChild href={profileHref}>
          <Pressable
            accessibilityLabel={actionLabel}
            accessibilityRole="link"
            style={styles.copyLink}
          >
            <Text style={[styles.copy, { color: theme.text }]}>
              <Text style={styles.name}>{name}</Text>님이 팔로우했습니다
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
  copyLink: { flex: 1, minHeight: 44, minWidth: 0 },
  copy: { fontFamily: 'SUIT', ...typography.sm },
  name: { fontFamily: 'SUIT', fontWeight: '700' },
  time: { fontFamily: 'SUIT', ...typography.xsm },
});
