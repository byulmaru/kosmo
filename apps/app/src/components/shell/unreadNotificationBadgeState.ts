export type UnreadNotificationBadgeLastSuccess = {
  profileId: string;
  count: number;
};

export function formatUnreadNotificationBadge(count: number | null): string | null {
  if (!count || count < 1) {
    return null;
  }

  return count > 99 ? '99+' : String(count);
}

export function getUnreadNotificationAccessibilityLabel(count: number | null): string {
  return count && count > 0 ? `알림, 읽지 않은 알림 ${count}개` : '알림';
}

export function getUnreadNotificationCountForProfile(
  node: { id?: string; unreadNotificationCount?: number } | null | undefined,
  profileId: string,
): number | null {
  return node?.id === profileId && typeof node.unreadNotificationCount === 'number'
    ? node.unreadNotificationCount
    : null;
}

export function getVisibleUnreadNotificationCount(
  lastSuccess: UnreadNotificationBadgeLastSuccess | null,
  selectedProfileId: string | null,
): number | null {
  return lastSuccess?.profileId === selectedProfileId ? lastSuccess.count : null;
}
