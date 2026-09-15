import type { Href } from 'expo-router';
import type { ReactionSummaryEntry } from './ReactionSummary';

type ReactionPeopleReturnFocusRecord = {
  entryId: string | null;
  fallbackFocus: (() => void) | null;
  focusId: string | null;
  focusPath: string | null;
  nativeFocus: (() => boolean) | null;
  pending: boolean;
};

const returnFocusRecords: ReactionPeopleReturnFocusRecord[] = [];
let activeReturnFocusIndex = -1;
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

  while (
    returnFocusRecords.length > 0 &&
    !returnFocusRecords[returnFocusRecords.length - 1]!.pending
  ) {
    returnFocusRecords.pop();
  }
  returnFocusRecords.push({
    entryId: null,
    fallbackFocus: fallbackFocus ?? null,
    focusId: focusId ?? null,
    focusPath: typeof document === 'undefined' ? null : (href.split(/[?#]/, 1)[0] ?? null),
    nativeFocus: nativeFocus ?? null,
    pending: true,
  });
  activeReturnFocusIndex = returnFocusRecords.length - 1;
  removeReactionPeoplePopStateListener?.();
  removeReactionPeoplePopStateListener = null;
}

export function consumeReactionPeopleReturnToOrigin() {
  const record = getActiveReturnFocusRecord();
  const value = record?.pending ?? false;
  if (record) {
    record.pending = false;
  }
  return value;
}

export function clearReactionPeopleReturnState() {
  returnFocusRecords.length = 0;
  activeReturnFocusIndex = -1;
  removeReactionPeoplePopStateListener?.();
  removeReactionPeoplePopStateListener = null;
}

export function discardReactionPeopleReturnEntry() {
  if (activeReturnFocusIndex < 0) {
    return;
  }

  returnFocusRecords.splice(activeReturnFocusIndex, 1);
  activeReturnFocusIndex = Math.min(activeReturnFocusIndex, returnFocusRecords.length - 1);
  if (returnFocusRecords.length === 0) {
    activeReturnFocusIndex = -1;
    removeReactionPeoplePopStateListener?.();
    removeReactionPeoplePopStateListener = null;
  }
}

export function bindReactionPeopleReturnEntry() {
  if (
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function' ||
    typeof window.requestAnimationFrame !== 'function' ||
    !window.history
  ) {
    return false;
  }

  const currentEntryId = getReactionPeopleEntryId(window.history.state);
  const matchingRecordIndex = currentEntryId
    ? returnFocusRecords.findIndex((record) => record.entryId === currentEntryId)
    : -1;
  if (matchingRecordIndex >= 0) {
    activeReturnFocusIndex = matchingRecordIndex;
    returnFocusRecords[matchingRecordIndex]!.pending = true;
  }
  const activeRecord = getActiveReturnFocusRecord();
  if (!activeRecord?.pending) {
    return false;
  }

  installReactionPeoplePopStateListener();
  window.requestAnimationFrame(() => {
    if (activeRecord === getActiveReturnFocusRecord() && activeRecord.entryId === null) {
      activeRecord.entryId = getReactionPeopleEntryId(window.history.state);
    }
  });
  return true;
}

export function hasReactionPeopleReturnToOrigin() {
  return getActiveReturnFocusRecord()?.pending ?? false;
}

export function restoreReactionPeopleReturnFocus(preserveForHistory = false) {
  const record = getActiveReturnFocusRecord();
  if (!record) {
    return;
  }

  if (typeof document === 'undefined') {
    const didNativeFocus = record.nativeFocus?.() ?? false;
    if (!didNativeFocus) {
      record.fallbackFocus?.();
    }
    if (!preserveForHistory) {
      discardReactionPeopleReturnEntry();
    }
    return;
  }

  if (!record.focusPath) {
    record.fallbackFocus?.();
    return;
  }

  const targetPath = record.focusPath;
  const targetId = record.focusId;
  const fallbackFocus = record.fallbackFocus;
  if (!preserveForHistory) {
    record.focusPath = null;
    record.focusId = null;
    record.fallbackFocus = null;
    record.nativeFocus = null;
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
    const entryId = getReactionPeopleEntryId(event.state);
    const matchingRecordIndex = entryId
      ? returnFocusRecords.findIndex((record) => record.entryId === entryId)
      : -1;
    if (matchingRecordIndex >= 0) {
      activeReturnFocusIndex = matchingRecordIndex;
      returnFocusRecords[matchingRecordIndex]!.pending = true;
      return;
    }

    if (hasReactionPeopleReturnToOrigin()) {
      consumeReactionPeopleReturnToOrigin();
      restoreReactionPeopleReturnFocus(true);
    }
  };
  window.addEventListener('popstate', onPopState);
  removeReactionPeoplePopStateListener = () => window.removeEventListener('popstate', onPopState);
}

function getActiveReturnFocusRecord() {
  return activeReturnFocusIndex >= 0 ? (returnFocusRecords[activeReturnFocusIndex] ?? null) : null;
}

function getReactionPeopleEntryId(state: unknown) {
  if (!state || typeof state !== 'object') {
    return null;
  }

  const id = (state as Record<string, unknown>).id;
  return typeof id === 'string' ? id : null;
}
