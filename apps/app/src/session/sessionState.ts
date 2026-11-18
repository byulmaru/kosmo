import { match, P } from 'ts-pattern';

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
  return {
    phase: 'ready',
    authLifecycleKey: event.authLifecycleKey,
    actorLifecycleKey: event.actorLifecycleKey,
    value: match([state, event])
      .with([P._, { type: 'session-resolved' }], ([, resolved]) => resolved.value)
      .with(
        [{ phase: 'ready', authLifecycleKey: event.authLifecycleKey }, { type: 'session-failed' }],
        ([previous]) => ({ ...previous.value, selectedProfileId: null }),
      )
      .with([P._, { type: 'session-failed' }], () => errorSession)
      .exhaustive(),
  };
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

export type ProfileRestoreDecision =
  | { type: 'none' }
  | { type: 'reset-actor' }
  | { type: 'select-server-profile'; profileId: string }
  | { type: 'reject-actor'; accountId: string }
  | { type: 'restore-profile'; accountId: string };

export function getProfileRestoreDecision(input: {
  sessionId: string | null;
  accountId: string | null;
  accountChanged: boolean;
  actorProfileId: string | null;
  serverProfileId: string | null;
}): ProfileRestoreDecision {
  return match({ ...input, authenticated: Boolean(input.sessionId && input.accountId) })
    .returnType<ProfileRestoreDecision>()
    .with({ sessionId: null, accountId: null, actorProfileId: P.string }, () => ({
      type: 'reset-actor',
    }))
    .with({ authenticated: false }, () => ({ type: 'none' }))
    .with({ accountChanged: true, actorProfileId: P.string }, () => ({
      type: 'reset-actor',
    }))
    .with({ actorProfileId: null, accountId: P.string }, ({ accountId }) => ({
      type: 'restore-profile',
      accountId,
    }))
    .when(
      ({ actorProfileId, serverProfileId }) => actorProfileId === serverProfileId,
      () => ({ type: 'none' }),
    )
    .with(
      { serverProfileId: P.string },
      ({ serverProfileId }) => Boolean(serverProfileId),
      ({ serverProfileId }) => ({ type: 'select-server-profile', profileId: serverProfileId }),
    )
    .with({ accountId: P.string }, ({ accountId }) => ({ type: 'reject-actor', accountId }))
    .otherwise(() => ({ type: 'none' }));
}

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
  return match(event)
    .returnType<ProfileRestoreState | null>()
    .with({ type: 'restore-started' }, ({ authKey, accountId, promise }) => ({
      phase: 'reading',
      authKey,
      accountId,
      promise,
    }))
    .with({ type: 'restore-read-completed' }, ({ authKey, accountId }) =>
      match(state)
        .returnType<ProfileRestoreState | null>()
        .with({ phase: 'reading', authKey, accountId }, () => ({
          phase: 'applied',
          authKey,
          accountId,
        }))
        .otherwise(() => state),
    )
    .with({ type: 'restore-server-rejected' }, ({ authKey, accountId }) => ({
      phase: 'applied',
      authKey,
      accountId,
    }))
    .exhaustive();
}
