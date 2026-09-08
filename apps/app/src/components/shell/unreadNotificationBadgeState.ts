export function getUnreadNotificationAccessibilityLabel(count: number | null): string {
  return count && count > 0 ? `알림, 읽지 않은 알림 ${count}개` : '알림';
}
