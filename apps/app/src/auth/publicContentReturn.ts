import type { MouseEvent as ReactMouseEvent } from 'react';
import type { GestureResponderEvent } from 'react-native';

const HOME_RETURN_TARGET_KEY = 'kosmo:public-content-return-home';
const CALLBACK_RETURN_TARGET_KEY = 'kosmo:public-content-return-callback';
const INVITATION_DISMISSED_KEY = 'kosmo:public-content-invitation-dismissed';

export type PublicContentReturnStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export function isSafePublicContentReturnTarget(value: string | null | undefined): value is string {
  if (
    !value ||
    !value.startsWith('/@') ||
    value.startsWith('//') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\\')
  ) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, 'https://kos.moe');
  } catch {
    return false;
  }
  if (
    parsed.origin !== 'https://kos.moe' ||
    parsed.pathname !== value ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    return false;
  }

  const segments = value.slice(1).split('/');
  if (segments.length < 1 || segments.length > 2) {
    return false;
  }

  try {
    const [profileSegment, postSegment] = segments.map(decodeURIComponent);
    if (!profileSegment?.startsWith('@') || profileSegment.length < 2) {
      return false;
    }
    if (postSegment === 'followers' || postSegment === 'following') {
      return false;
    }
    return [profileSegment, postSegment].every((segment) => {
      if (segment === undefined) {
        return true;
      }
      const hasPathDelimiter = ['\\', '/', '?', '#'].some((delimiter) =>
        segment.includes(delimiter),
      );
      const hasControlCharacter = [...segment].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1f || codePoint === 0x7f;
      });
      return (
        segment.length > 0 &&
        segment !== '.' &&
        segment !== '..' &&
        !hasPathDelimiter &&
        !hasControlCharacter
      );
    });
  } catch {
    return false;
  }
}

export function saveHomeReturnTarget(
  value: string,
  storage: PublicContentReturnStorage | null = getTabStorage(),
): void {
  const target = isSafePublicContentReturnTarget(value) ? value : null;
  updateStoredValue(storage, HOME_RETURN_TARGET_KEY, target);
}

export function getHomeReturnTarget(
  storage: PublicContentReturnStorage | null = getTabStorage(),
): string | null {
  return readStoredTarget(storage, HOME_RETURN_TARGET_KEY);
}

export function consumeHomeReturnTarget(
  storage: PublicContentReturnStorage | null = getTabStorage(),
): string | null {
  return consumeStoredTarget(storage, HOME_RETURN_TARGET_KEY);
}

export function saveCallbackReturnTarget(
  value: string | null | undefined,
  storage: PublicContentReturnStorage | null = getTabStorage(),
): void {
  updateStoredValue(storage, CALLBACK_RETURN_TARGET_KEY, value ?? null);
}

export function getCallbackReturnTarget(
  storage: PublicContentReturnStorage | null = getTabStorage(),
): string | null {
  return readStoredTarget(storage, CALLBACK_RETURN_TARGET_KEY);
}

export function consumeCallbackReturnTarget(
  storage: PublicContentReturnStorage | null = getTabStorage(),
): string | null {
  return consumeStoredTarget(storage, CALLBACK_RETURN_TARGET_KEY);
}

export function clearCallbackReturnTarget(
  storage: PublicContentReturnStorage | null = getTabStorage(),
): void {
  removeStoredValue(storage, CALLBACK_RETURN_TARGET_KEY);
}

export function readInvitationDismissed(
  storage: PublicContentReturnStorage | null = getTabStorage(),
): boolean {
  try {
    return storage?.getItem(INVITATION_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveInvitationDismissed(
  storage: PublicContentReturnStorage | null = getTabStorage(),
): void {
  try {
    storage?.setItem(INVITATION_DISMISSED_KEY, '1');
  } catch {
    // Keep the current render dismissible when browser storage is unavailable.
  }
}

export function buildWebLoginHref(value: string | null | undefined): string {
  if (!isSafePublicContentReturnTarget(value)) {
    return '/login';
  }
  return `/login?returnTo=${encodeURIComponent(value)}`;
}

export type WebActivationEvent = GestureResponderEvent | ReactMouseEvent<HTMLAnchorElement>;

export function isPrimaryWebActivation(event: WebActivationEvent): boolean {
  const pointer = event.nativeEvent as unknown as MouseEvent;
  return (
    (typeof pointer.button !== 'number' || pointer.button === 0) &&
    !pointer.altKey &&
    !pointer.ctrlKey &&
    !pointer.metaKey &&
    !pointer.shiftKey
  );
}

function getTabStorage(): PublicContentReturnStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredTarget(storage: PublicContentReturnStorage | null, key: string): string | null {
  try {
    const target = storage?.getItem(key) ?? null;
    return isSafePublicContentReturnTarget(target) ? target : null;
  } catch {
    return null;
  }
}

function consumeStoredTarget(
  storage: PublicContentReturnStorage | null,
  key: string,
): string | null {
  const target = readStoredTarget(storage, key);
  removeStoredValue(storage, key);
  return target;
}

function updateStoredValue(
  storage: PublicContentReturnStorage | null,
  key: string,
  target: string | null,
): void {
  try {
    if (target) {
      storage?.setItem(key, target);
    } else {
      storage?.removeItem(key);
    }
  } catch {
    // Navigation still works when browser storage is unavailable.
  }
}

function removeStoredValue(storage: PublicContentReturnStorage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // A stale target is never returned when browser storage cannot be cleared.
  }
}
