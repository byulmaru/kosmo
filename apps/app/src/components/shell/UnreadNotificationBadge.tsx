import { StyleSheet } from 'react-native';
import { UnreadDot } from './UnreadDot';

export function UnreadNotificationBadge({ count }: { count: number | null }) {
  if (!count || count < 1) {
    return null;
  }

  return <UnreadDot style={styles.dot} testID="unread-notification-dot" />;
}

const styles = StyleSheet.create({
  dot: {
    height: 8,
    position: 'absolute',
    right: 2,
    top: -1,
    width: 8,
    zIndex: 1,
  },
});
