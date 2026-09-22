import { trackAnalytics } from './client';

const pendingSessionStorageKey = 'kosmo.profile-hashtag-exploration.pending';
const pendingSessions = new Map<string, PendingSession>();
const activeTrackers = new Map<string, RetainedTracker>();

type PendingSession = {
  accountId: string;
  sessionId: string;
};

type RetainedTracker = {
  releaseTimer: ReturnType<typeof setTimeout> | null;
  retainCount: number;
  sessionId: string;
  tracker: ProfileHashtagExplorationTracker;
};

export type ProfileHashtagExplorationSession = {
  sessionId: string;
  hashtagId?: string;
};

export type ProfileHashtagExplorationTracker = {
  recordInitialFailure: () => void;
  recordInitialResults: (hasResults: boolean) => void;
  recordPaginationFailure: () => void;
  recordResultSelected: () => void;
  end: () => void;
};

export function beginProfileHashtagExploration(
  accountId: string,
  hashtagId: string,
  { persistForExternal = false }: { persistForExternal?: boolean } = {},
): void {
  const sessionId = globalThis.crypto?.randomUUID?.();
  if (!sessionId) {
    return;
  }

  if (persistForExternal) {
    writePendingSession(hashtagId, { accountId, sessionId });
    setTimeout(() => removePendingSession(hashtagId, sessionId), 0);
  } else {
    pendingSessions.set(hashtagId, { accountId, sessionId });
  }
  trackAnalytics('profile_hashtag_exploration_started', properties({ sessionId, hashtagId }));
}

export function acquireProfileHashtagExplorationTracker(accountId: string, hashtagId: string) {
  const key = `${accountId}\0${hashtagId}`;
  const pendingSession = consumeProfileHashtagExploration(accountId, hashtagId);
  let retained = activeTrackers.get(key);

  if (pendingSession) {
    if (retained) {
      if (retained.releaseTimer) {
        clearTimeout(retained.releaseTimer);
      }
      retained.tracker.end();
    }
    retained = {
      releaseTimer: null,
      retainCount: 0,
      sessionId: pendingSession.sessionId,
      tracker: createProfileHashtagExplorationTracker(pendingSession),
    };
    activeTrackers.set(key, retained);
  }

  if (!retained) {
    return null;
  }

  if (retained.releaseTimer) {
    clearTimeout(retained.releaseTimer);
    retained.releaseTimer = null;
  }
  retained.retainCount += 1;

  let released = false;
  return {
    tracker: retained.tracker,
    release() {
      if (released) {
        return;
      }
      released = true;
      retained.retainCount -= 1;
      if (retained.retainCount > 0) {
        return;
      }

      retained.releaseTimer = setTimeout(() => {
        if (retained.retainCount === 0 && activeTrackers.get(key) === retained) {
          retained.tracker.end();
          activeTrackers.delete(key);
        }
      }, 0);
    },
  };
}

export function endProfileHashtagExplorationsForAccount(accountId: string): void {
  const endedSessionIds = new Set<string>();
  const keyPrefix = `${accountId}\0`;
  for (const [key, retained] of activeTrackers) {
    if (!key.startsWith(keyPrefix)) {
      continue;
    }
    if (retained.releaseTimer) {
      clearTimeout(retained.releaseTimer);
    }
    retained.tracker.end();
    endedSessionIds.add(retained.sessionId);
    activeTrackers.delete(key);
  }

  for (const [hashtagId, session] of pendingSessions) {
    if (session.accountId === accountId) {
      pendingSessions.delete(hashtagId);
      endPendingSession(hashtagId, session, endedSessionIds);
    }
  }
  for (const [hashtagId, session] of removePendingSessionsForAccount(accountId)) {
    endPendingSession(hashtagId, session, endedSessionIds);
  }
}

export function consumeProfileHashtagExploration(
  accountId: string,
  hashtagId: string,
): ProfileHashtagExplorationSession | null {
  const pendingSession = pendingSessions.get(hashtagId) ?? readPendingSession(hashtagId);
  if (pendingSession?.accountId !== accountId) {
    pendingSessions.delete(hashtagId);
    removePendingSession(hashtagId);
    return null;
  }

  pendingSessions.delete(hashtagId);
  removePendingSession(hashtagId);

  return pendingSession ? { hashtagId, sessionId: pendingSession.sessionId } : null;
}

export function createProfileHashtagExplorationTracker(
  session: ProfileHashtagExplorationSession,
): ProfileHashtagExplorationTracker {
  let initialFailureRecorded = false;
  let initialResultsRecorded = false;
  let resultSelectedRecorded = false;
  let ended = false;

  return {
    recordInitialFailure() {
      if (ended || initialFailureRecorded || initialResultsRecorded) {
        return;
      }

      initialFailureRecorded = true;
      trackAnalytics('profile_hashtag_results_failed', {
        ...properties(session),
        stage: 'initial',
      });
    },
    recordInitialResults(hasResults) {
      if (ended || initialResultsRecorded) {
        return;
      }

      initialResultsRecorded = true;
      trackAnalytics('profile_hashtag_results_loaded', {
        ...properties(session),
        result: hasResults ? 'has_results' : 'empty',
        stage: 'initial',
      });
    },
    recordPaginationFailure() {
      if (ended) {
        return;
      }
      trackAnalytics('profile_hashtag_results_failed', {
        ...properties(session),
        stage: 'pagination',
      });
    },
    recordResultSelected() {
      if (ended || resultSelectedRecorded) {
        return;
      }

      resultSelectedRecorded = true;
      trackAnalytics('profile_hashtag_result_selected', properties(session));
    },
    end() {
      if (ended) {
        return;
      }

      ended = true;
      trackAnalytics('profile_hashtag_exploration_ended', properties(session));
    },
  };
}

function properties(session: { sessionId: string; hashtagId?: string }) {
  return session.hashtagId
    ? {
        hashtag_id: session.hashtagId,
        profile_tag_exploration_session_id: session.sessionId,
      }
    : { profile_tag_exploration_session_id: session.sessionId };
}

function getPendingSessionStorage(): Storage | null {
  try {
    return typeof globalThis.sessionStorage === 'undefined' ? null : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function readPendingSession(hashtagId: string): PendingSession | undefined {
  const storage = getPendingSessionStorage();
  if (!storage) {
    return undefined;
  }

  try {
    const raw = storage.getItem(pendingSessionStorageKey);
    if (!raw) {
      return undefined;
    }

    const sessions = JSON.parse(raw) as Record<string, unknown>;
    const session = sessions[hashtagId];
    if (!session || typeof session !== 'object') {
      return undefined;
    }
    const { accountId, sessionId } = session as Record<string, unknown>;
    return typeof accountId === 'string' && accountId && typeof sessionId === 'string' && sessionId
      ? { accountId, sessionId }
      : undefined;
  } catch {
    return undefined;
  }
}

function writePendingSession(hashtagId: string, session: PendingSession): void {
  const storage = getPendingSessionStorage();
  if (!storage) {
    return;
  }

  try {
    const raw = storage.getItem(pendingSessionStorageKey);
    const sessions = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    storage.setItem(
      pendingSessionStorageKey,
      JSON.stringify({ ...sessions, [hashtagId]: session }),
    );
  } catch {
    // Analytics context is best-effort and must not affect navigation.
  }
}

function removePendingSession(hashtagId: string, expectedSessionId?: string): void {
  const storage = getPendingSessionStorage();
  if (!storage) {
    return;
  }

  try {
    const raw = storage.getItem(pendingSessionStorageKey);
    if (!raw) {
      return;
    }

    const sessions = JSON.parse(raw) as Record<string, unknown>;
    if (expectedSessionId) {
      const session = sessions[hashtagId];
      if (
        !session ||
        typeof session !== 'object' ||
        (session as Record<string, unknown>).sessionId !== expectedSessionId
      ) {
        return;
      }
    }
    delete sessions[hashtagId];
    storage.setItem(pendingSessionStorageKey, JSON.stringify(sessions));
  } catch {
    // Analytics context is best-effort and must not affect navigation.
  }
}

function removePendingSessionsForAccount(accountId: string): Array<[string, PendingSession]> {
  const storage = getPendingSessionStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(pendingSessionStorageKey);
    if (!raw) {
      return [];
    }

    const sessions = JSON.parse(raw) as Record<string, unknown>;
    const removed: Array<[string, PendingSession]> = [];
    for (const [hashtagId, session] of Object.entries(sessions)) {
      if (
        session &&
        typeof session === 'object' &&
        (session as Record<string, unknown>).accountId === accountId
      ) {
        const { sessionId } = session as Record<string, unknown>;
        if (typeof sessionId === 'string' && sessionId) {
          removed.push([hashtagId, { accountId, sessionId }]);
        }
        delete sessions[hashtagId];
      }
    }
    storage.setItem(pendingSessionStorageKey, JSON.stringify(sessions));
    return removed;
  } catch {
    // Analytics context is best-effort and must not affect the session lifecycle.
    return [];
  }
}

function endPendingSession(
  hashtagId: string,
  session: PendingSession,
  endedSessionIds: Set<string>,
): void {
  if (endedSessionIds.has(session.sessionId)) {
    return;
  }
  endedSessionIds.add(session.sessionId);
  createProfileHashtagExplorationTracker({ hashtagId, sessionId: session.sessionId }).end();
}
