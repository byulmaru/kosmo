import type { Href } from 'expo-router';
import type { ReactionSummaryEntry } from './ReactionSummary';

let pendingReturnFocusPath: string | null = null;
let pendingReturnFocusId: string | null = null;
let pendingReturnFocusFallback: (() => void) | null = null;
let pendingReturnToOrigin = false;

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
) {
  if (typeof href !== 'string') {
    return;
  }

  pendingReturnToOrigin = true;
  pendingReturnFocusId = focusId ?? null;
  pendingReturnFocusFallback = fallbackFocus ?? null;
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

export function hasReactionPeopleReturnToOrigin() {
  return pendingReturnToOrigin;
}

export function restoreReactionPeopleReturnFocus() {
  if (typeof document === 'undefined' || !pendingReturnFocusPath) {
    const fallbackFocus = pendingReturnFocusFallback;
    pendingReturnFocusPath = null;
    pendingReturnFocusId = null;
    pendingReturnFocusFallback = null;
    fallbackFocus?.();
    return;
  }

  const targetPath = pendingReturnFocusPath;
  const targetId = pendingReturnFocusId;
  const fallbackFocus = pendingReturnFocusFallback;
  pendingReturnFocusPath = null;
  pendingReturnFocusId = null;
  pendingReturnFocusFallback = null;
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
