export type ProfileSwitcherUnreadSnapshot = {
  accountId: string;
  hasUnreadByProfileId: Readonly<Record<string, boolean>>;
};

export type ProfileSwitcherUnreadRequestIdentity = {
  accountId: string;
  environment: object;
  environmentGeneration: number;
  requestVersion: number;
};

export function createProfileSwitcherUnreadSnapshot(
  accountId: string,
  profiles: readonly { id: string; unreadNotificationCount: number }[],
): ProfileSwitcherUnreadSnapshot {
  return {
    accountId,
    hasUnreadByProfileId: Object.fromEntries(
      profiles.map(({ id, unreadNotificationCount }) => [id, unreadNotificationCount > 0]),
    ),
  };
}

export function getProfileSwitcherHasUnread(
  snapshot: ProfileSwitcherUnreadSnapshot | null,
  accountId: string | null,
  profileId: string,
): boolean {
  return snapshot?.accountId === accountId && snapshot.hasUnreadByProfileId[profileId] === true;
}

export function isCurrentProfileSwitcherUnreadRequest(
  request: ProfileSwitcherUnreadRequestIdentity,
  current: ProfileSwitcherUnreadRequestIdentity,
): boolean {
  return (
    request.accountId === current.accountId &&
    request.environment === current.environment &&
    request.environmentGeneration === current.environmentGeneration &&
    request.requestVersion === current.requestVersion
  );
}
