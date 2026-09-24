import { trackAnalytics } from './client';

const pendingSessionStorageKey = 'kosmo.profile-hashtag-exploration.pending';
const pendingSessions = new Map<string, string>();

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
  hashtagId: string,
  { persistForExternal = false }: { persistForExternal?: boolean } = {},
): void {
  const sessionId = globalThis.crypto?.randomUUID?.();
  if (!sessionId) {
    return;
  }

  if (persistForExternal) {
    writePendingSession(hashtagId, sessionId);
  } else {
    pendingSessions.set(hashtagId, sessionId);
  }
  trackAnalytics('profile_hashtag_exploration_started', properties({ sessionId, hashtagId }));
}

export function consumeProfileHashtagExploration(
  hashtagId: string,
): ProfileHashtagExplorationSession | null {
  const sessionId = pendingSessions.get(hashtagId) ?? readPendingSession(hashtagId);
  pendingSessions.delete(hashtagId);
  removePendingSession(hashtagId);

  return sessionId ? { hashtagId, sessionId } : null;
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
      if (initialFailureRecorded || initialResultsRecorded) {
        return;
      }

      initialFailureRecorded = true;
      trackAnalytics('profile_hashtag_results_failed', {
        ...properties(session),
        stage: 'initial',
      });
    },
    recordInitialResults(hasResults) {
      if (initialResultsRecorded) {
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
      trackAnalytics('profile_hashtag_results_failed', {
        ...properties(session),
        stage: 'pagination',
      });
    },
    recordResultSelected() {
      if (resultSelectedRecorded) {
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

function readPendingSession(hashtagId: string): string | undefined {
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
    const sessionId = sessions[hashtagId];
    return typeof sessionId === 'string' && sessionId ? sessionId : undefined;
  } catch {
    return undefined;
  }
}

function writePendingSession(hashtagId: string, sessionId: string): void {
  const storage = getPendingSessionStorage();
  if (!storage) {
    return;
  }

  try {
    const raw = storage.getItem(pendingSessionStorageKey);
    const sessions = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    storage.setItem(
      pendingSessionStorageKey,
      JSON.stringify({ ...sessions, [hashtagId]: sessionId }),
    );
  } catch {
    // Analytics context is best-effort and must not affect navigation.
  }
}

function removePendingSession(hashtagId: string): void {
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
    delete sessions[hashtagId];
    storage.setItem(pendingSessionStorageKey, JSON.stringify(sessions));
  } catch {
    // Analytics context is best-effort and must not affect navigation.
  }
}
