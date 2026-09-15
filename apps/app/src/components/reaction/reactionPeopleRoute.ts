import type { Href } from 'expo-router';
import type { ReactionSummaryEntry } from './ReactionSummary';

let pendingReturnFocusPath: string | null = null;
let pendingReturnFocusId: string | null = null;
let pendingReturnFocusFallback: (() => void) | null = null;
let pendingReturnNativeFocus: (() => boolean) | null = null;
let pendingReturnEntryId: string | null = null;
let pendingReturnToOrigin = false;
let removeReactionPeoplePopStateListener: (() => void) | null = null;

export function resolveReactionPeopleType(
  entries: ReadonlyArray<ReactionSummaryEntry>,
  requestedType?: string | null,
): string | null {
  const positiveEntries = entries.filter((entry) => entry.count > 0);
  return (
    positiveEntries.find((entry) => entry.type === requestedType)?.type ??
    positiveEntries[0]?.type ??
    null
  );
}

export function getReactionPeopleHref(
  relativeHandle: string,
  postId: string,
  reactionType?: string | null,
): Href {
  const query = reactionType ? `?type=${encodeURIComponent(reactionType)}` : '';
  return `/${relativeHandle}/${postId}/reactions${query}` as Href;
}

export function rememberReactionPeopleReturnFocus(
  href: Href,
  focusId?: string,
  fallbackFocus?: () => void,
  nativeFocus?: () => boolean,
) {
  if (typeof href !== 'string') {
    return;
  }

  pendingReturnToOrigin = true;
  pendingReturnEntryId = null;
  removeReactionPeoplePopStateListener?.();
  removeReactionPeoplePopStateListener = null;
  pendingReturnFocusId = focusId ?? null;
  pendingReturnFocusFallback = fallbackFocus ?? null;
  pendingReturnNativeFocus = nativeFocus ?? null;
  if (typeof document === 'undefined') {
    return;
  }

  pendingReturnFocusPath = href.split(/[?#]/, 1)[0] ?? null;
}

export function consumeReactionPeopleReturnToOrigin() {
  const value = pendingReturnToOrigin;
  pendingReturnToOrigin = false;
  return value;
}

export function clearReactionPeopleReturnState() {
  pendingReturnToOrigin = false;
  pendingReturnEntryId = null;
  removeReactionPeoplePopStateListener?.();
  removeReactionPeoplePopStateListener = null;
  pendingReturnFocusPath = null;
  pendingReturnFocusId = null;
  pendingReturnFocusFallback = null;
  pendingReturnNativeFocus = null;
}

export function bindReactionPeopleReturnEntry() {
  if (
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function' ||
    typeof window.requestAnimationFrame !== 'function' ||
    !window.history ||
    !pendingReturnToOrigin
  ) {
    return false;
  }

  installReactionPeoplePopStateListener();
  window.requestAnimationFrame(() => {
    if (pendingReturnToOrigin) {
      pendingReturnEntryId = getReactionPeopleEntryId(window.history.state);
    }
  });
  return true;
}

export function hasReactionPeopleReturnToOrigin() {
  return pendingReturnToOrigin;
}

export function restoreReactionPeopleReturnFocus(preserveForHistory = false) {
  if (typeof document === 'undefined' || !pendingReturnFocusPath) {
    const nativeFocus = pendingReturnNativeFocus;
    const fallbackFocus = pendingReturnFocusFallback;
    if (!preserveForHistory) {
      pendingReturnFocusPath = null;
      pendingReturnFocusId = null;
      pendingReturnFocusFallback = null;
      pendingReturnNativeFocus = null;
    }
    if (typeof document === 'undefined' && nativeFocus?.()) {
      return;
    }
    fallbackFocus?.();
    return;
  }

  const targetPath = pendingReturnFocusPath;
  const targetId = pendingReturnFocusId;
  const fallbackFocus = pendingReturnFocusFallback;
  if (!preserveForHistory) {
    pendingReturnFocusPath = null;
    pendingReturnFocusId = null;
    pendingReturnFocusFallback = null;
    pendingReturnNativeFocus = null;
  }
  let attempts = 0;
  const focus = () => {
    const identifiedTarget = targetId ? document.getElementById(targetId) : null;
    const target = targetId
      ? identifiedTarget?.getAttribute('href')?.split(/[?#]/, 1)[0] === targetPath
        ? identifiedTarget
        : null
      : Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).find(
          (anchor) => anchor.getAttribute('href')?.split(/[?#]/, 1)[0] === targetPath,
        );
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }

    if (attempts < 10) {
      attempts += 1;
      if (globalThis.requestAnimationFrame) {
        globalThis.requestAnimationFrame(focus);
      } else {
        focus();
      }
      return;
    }

    fallbackFocus?.();
  };

  if (globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame(focus);
  } else {
    focus();
  }
}

function installReactionPeoplePopStateListener() {
  if (typeof window === 'undefined' || removeReactionPeoplePopStateListener) {
    return;
  }

  const onPopState = (event: PopStateEvent) => {
    if (getReactionPeopleEntryId(event.state) === pendingReturnEntryId) {
      pendingReturnToOrigin = true;
      return;
    }

    if (pendingReturnToOrigin) {
      consumeReactionPeopleReturnToOrigin();
      restoreReactionPeopleReturnFocus(true);
    }
  };
  window.addEventListener('popstate', onPopState);
  removeReactionPeoplePopStateListener = () => window.removeEventListener('popstate', onPopState);
}

function getReactionPeopleEntryId(state: unknown) {
  if (!state || typeof state !== 'object') {
    return null;
  }

  const id = (state as Record<string, unknown>).id;
  return typeof id === 'string' ? id : null;
}
