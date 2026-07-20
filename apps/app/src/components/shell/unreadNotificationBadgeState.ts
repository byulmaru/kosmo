export type UnreadNotificationBadgeState = {
  activeProfileId: string | null;
  lastSuccessCount: number | null;
};

export type UnreadNotificationBadgeAction =
  | { type: 'select'; profileId: string | null }
  | { type: 'success'; profileId: string; count: number }
  | { type: 'error'; profileId: string };

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
  state: UnreadNotificationBadgeState,
  selectedProfileId: string | null,
): number | null {
  return state.activeProfileId === selectedProfileId ? state.lastSuccessCount : null;
}

export function reduceUnreadNotificationBadgeState(
  state: UnreadNotificationBadgeState,
  action: UnreadNotificationBadgeAction,
): UnreadNotificationBadgeState {
  switch (action.type) {
    case 'select':
      return state.activeProfileId === action.profileId
        ? state
        : { activeProfileId: action.profileId, lastSuccessCount: null };
    case 'success':
      return state.activeProfileId === action.profileId
        ? { ...state, lastSuccessCount: action.count }
        : state;
    case 'error':
      return state;
  }
}
