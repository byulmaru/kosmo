export type SessionValue = {
  accountId: string | null;
  accountName: string | null;
  selectedProfileId: string | null;
  sessionId: string | null;
  status: 'error' | 'guest' | 'valid';
};

export type SessionState =
  | {
      phase: 'initializing';
      authLifecycleKey: string;
      actorLifecycleKey: string;
      value: SessionValue;
    }
  | {
      phase: 'ready';
      authLifecycleKey: string;
      actorLifecycleKey: string;
      value: SessionValue;
    };

type SessionStateEvent =
  | {
      type: 'session-resolved';
      authLifecycleKey: string;
      actorLifecycleKey: string;
      value: SessionValue;
    }
  | {
      type: 'session-failed';
      authLifecycleKey: string;
      actorLifecycleKey: string;
    };

export const guestSession: SessionValue = {
  accountId: null,
  accountName: null,
  selectedProfileId: null,
  sessionId: null,
  status: 'guest',
};

export const errorSession: SessionValue = { ...guestSession, status: 'error' };

export function reduceSessionState(state: SessionState, event: SessionStateEvent): SessionState {
  switch (event.type) {
    case 'session-resolved':
      return {
        phase: 'ready',
        authLifecycleKey: event.authLifecycleKey,
        actorLifecycleKey: event.actorLifecycleKey,
        value: event.value,
      };
    case 'session-failed':
      return {
        phase: 'ready',
        authLifecycleKey: event.authLifecycleKey,
        actorLifecycleKey: event.actorLifecycleKey,
        value:
          state.authLifecycleKey === event.authLifecycleKey && state.phase === 'ready'
            ? { ...state.value, selectedProfileId: null }
            : errorSession,
      };
  }
}

export function projectVisibleSession(
  state: SessionState,
  authLifecycleKey: string,
  actorLifecycleKey: string,
): SessionValue {
  if (state.authLifecycleKey !== authLifecycleKey) {
    return errorSession;
  }

  if (state.actorLifecycleKey !== actorLifecycleKey) {
    return { ...state.value, selectedProfileId: null };
  }

  return state.value;
}

export type ProfileRestoreState =
  | {
      phase: 'reading';
      authKey: string;
      accountId: string;
      promise: Promise<string | null>;
    }
  | {
      phase: 'applied';
      authKey: string;
      accountId: string;
    };

type ProfileRestoreEvent =
  | {
      type: 'restore-started';
      authKey: string;
      accountId: string;
      promise: Promise<string | null>;
    }
  | {
      type: 'restore-read-completed';
      authKey: string;
      accountId: string;
    }
  | {
      type: 'restore-server-rejected';
      authKey: string;
      accountId: string;
    };

export function reduceProfileRestoreState(
  state: ProfileRestoreState | null,
  event: Extract<ProfileRestoreEvent, { type: 'restore-started' }>,
): Extract<ProfileRestoreState, { phase: 'reading' }>;
export function reduceProfileRestoreState(
  state: ProfileRestoreState | null,
  event: ProfileRestoreEvent,
): ProfileRestoreState | null;
export function reduceProfileRestoreState(
  state: ProfileRestoreState | null,
  event: ProfileRestoreEvent,
): ProfileRestoreState | null {
  switch (event.type) {
    case 'restore-started':
      return {
        phase: 'reading',
        authKey: event.authKey,
        accountId: event.accountId,
        promise: event.promise,
      };
    case 'restore-read-completed':
      if (
        state?.phase !== 'reading' ||
        state.authKey !== event.authKey ||
        state.accountId !== event.accountId
      ) {
        return state;
      }

      return { phase: 'applied', authKey: event.authKey, accountId: event.accountId };
    case 'restore-server-rejected':
      return { phase: 'applied', authKey: event.authKey, accountId: event.accountId };
  }
}
