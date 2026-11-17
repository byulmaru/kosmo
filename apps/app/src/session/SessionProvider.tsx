import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { match } from 'ts-pattern';
import {
  deleteSelectedProfile,
  readSelectedProfile,
  writeSelectedProfile,
} from '@/auth/selectedProfileStorage';
import { RelayFailOpenBoundary } from '@/components/RelayFailOpenBoundary';
import { Splash } from '@/components/Splash';
import {
  useRelayActor,
  useRelayActorLifecycleKey,
  useRelayAuthLifecycleKey,
} from '@/relay/RelayActorProvider';
import {
  errorSession,
  getProfileRestoreDecision,
  guestSession,
  projectVisibleSession,
  reduceProfileRestoreState,
  reduceSessionState,
} from './sessionState';
import type { PropsWithChildren } from 'react';
import type { SessionProviderQuery as SessionProviderQueryType } from './__generated__/SessionProviderQuery.graphql';
import type { ProfileRestoreState, SessionState, SessionValue } from './sessionState';

type SessionChange = {
  accountChanged: boolean;
  cleanupPromise: Promise<void>;
};

const SessionContext = createContext<SessionValue>(guestSession);
const AnalyticsIdentityAccountContext = createContext<string | null>(null);

const SessionProviderQuery = graphql`
  query SessionProviderQuery {
    currentSession {
      id
      selectedProfile {
        id
      }
    }
    me {
      id
      name
    }
  }
`;

export function SessionProvider({ children }: PropsWithChildren) {
  const [fetchKey, setFetchKey] = useState(0);
  const authLifecycleKey = useRelayAuthLifecycleKey();
  const actorLifecycleKey = useRelayActorLifecycleKey();
  const lifecycleKeysRef = useRef({ authLifecycleKey, actorLifecycleKey });
  lifecycleKeysRef.current = { authLifecycleKey, actorLifecycleKey };
  const [sessionState, dispatchSessionState] = useReducer(reduceSessionState, {
    phase: 'initializing',
    authLifecycleKey,
    actorLifecycleKey,
    value: guestSession,
  } satisfies SessionState);
  const confirmedIdentityRef = useRef<{
    authKey: string;
    accountId: string | null;
    cleanupPromise: Promise<void>;
  } | null>(null);
  const restoreRef = useRef<ProfileRestoreState | null>(null);
  const setSession = useCallback(
    (authKey: string, actorKey: string, value: SessionValue): SessionChange | null => {
      const currentKeys = lifecycleKeysRef.current;
      if (authKey !== currentKeys.authLifecycleKey || actorKey !== currentKeys.actorLifecycleKey) {
        return null;
      }

      const previousIdentity = confirmedIdentityRef.current;
      const confirmedGuest = value.sessionId === null && value.accountId === null;
      const confirmedValid = Boolean(value.sessionId && value.accountId);
      let accountChanged = false;
      let cleanupPromise = previousIdentity?.cleanupPromise ?? Promise.resolve();

      if (confirmedGuest || confirmedValid) {
        const sameIdentity =
          previousIdentity?.authKey === authKey && previousIdentity.accountId === value.accountId;
        accountChanged =
          confirmedValid &&
          previousIdentity !== null &&
          previousIdentity.accountId !== null &&
          previousIdentity.accountId !== value.accountId;

        if ((confirmedGuest && !sameIdentity) || accountChanged) {
          cleanupPromise = cleanupPromise
            .then(() => deleteSelectedProfile())
            .catch(() => undefined);
        }

        confirmedIdentityRef.current = { authKey, accountId: value.accountId, cleanupPromise };
      }

      dispatchSessionState({
        type: 'session-resolved',
        authLifecycleKey: authKey,
        actorLifecycleKey: actorKey,
        value,
      });
      return { accountChanged, cleanupPromise };
    },
    [],
  );
  const setSessionError = useCallback((authKey: string, actorKey: string) => {
    const currentKeys = lifecycleKeysRef.current;
    if (authKey !== currentKeys.authLifecycleKey || actorKey !== currentKeys.actorLifecycleKey) {
      return;
    }

    dispatchSessionState({
      type: 'session-failed',
      authLifecycleKey: authKey,
      actorLifecycleKey: actorKey,
    });
  }, []);
  const visibleSession = projectVisibleSession(sessionState, authLifecycleKey, actorLifecycleKey);

  return (
    <AnalyticsIdentityAccountContext.Provider value={sessionState.value.accountId}>
      <SessionContext.Provider value={visibleSession}>
        <RelayFailOpenBoundary
          onRetry={() => setFetchKey((key) => key + 1)}
          fallback={
            <SessionErrorReporter
              authLifecycleKey={authLifecycleKey}
              actorLifecycleKey={actorLifecycleKey}
              onError={setSessionError}
            />
          }
        >
          <Suspense fallback={<Splash label="세션을 확인하는 중입니다." />}>
            <SessionQuery
              fetchKey={fetchKey}
              authLifecycleKey={authLifecycleKey}
              actorLifecycleKey={actorLifecycleKey}
              onSessionChange={setSession}
              restoreRef={restoreRef}
            />
          </Suspense>
        </RelayFailOpenBoundary>
        {sessionState.phase === 'ready' ? children : null}
      </SessionContext.Provider>
    </AnalyticsIdentityAccountContext.Provider>
  );
}

function SessionQuery({
  fetchKey,
  authLifecycleKey,
  actorLifecycleKey,
  onSessionChange,
  restoreRef,
}: {
  fetchKey: number;
  authLifecycleKey: string;
  actorLifecycleKey: string;
  restoreRef: { current: ProfileRestoreState | null };
  onSessionChange: (
    authLifecycleKey: string,
    actorLifecycleKey: string,
    value: SessionValue,
  ) => SessionChange | null;
}) {
  const {
    clearNativeSession,
    nativeToken,
    resetActor,
    resetRejectedCurrentActor,
    selectedProfileId: actorSelectedProfileId,
  } = useRelayActor();
  const data = useLazyLoadQuery<SessionProviderQueryType>(
    SessionProviderQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const sessionId = data.currentSession?.id ?? null;
  const accountId = data.me?.id ?? null;
  const serverSelectedProfileId = data.currentSession?.selectedProfile?.id ?? null;
  const session = useMemo(
    () => ({
      accountId,
      accountName: data.me?.name ?? null,
      selectedProfileId:
        actorSelectedProfileId === serverSelectedProfileId ? serverSelectedProfileId : null,
      sessionId,
      status: sessionId ? ('valid' as const) : ('guest' as const),
    }),
    [accountId, actorSelectedProfileId, data.me?.name, serverSelectedProfileId, sessionId],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' && nativeToken && !sessionId) {
      void clearNativeSession().catch(() => undefined);
    }
  }, [authLifecycleKey, clearNativeSession, nativeToken, sessionId]);

  useEffect(() => {
    let active = true;
    const deactivate = () => {
      active = false;
    };
    const identityChange = onSessionChange(authLifecycleKey, actorLifecycleKey, session);
    if (!identityChange) {
      return;
    }

    const decision = getProfileRestoreDecision({
      sessionId,
      accountId,
      accountChanged: identityChange.accountChanged,
      actorProfileId: actorSelectedProfileId,
      serverProfileId: serverSelectedProfileId,
    });

    void match(decision)
      .with({ type: 'none' }, () => undefined)
      .with({ type: 'reset-actor' }, () => resetActor(null))
      .with({ type: 'select-server-profile' }, async ({ profileId }) => {
        await identityChange.cleanupPromise;
        if (!active) {
          return;
        }

        void writeSelectedProfile(profileId);
        resetActor(profileId);
      })
      .with({ type: 'reject-actor' }, async ({ accountId }) => {
        await identityChange.cleanupPromise;
        if (!active) {
          return;
        }

        restoreRef.current = reduceProfileRestoreState(restoreRef.current, {
          type: 'restore-server-rejected',
          authKey: authLifecycleKey,
          accountId,
        });
        resetRejectedCurrentActor();
      })
      .with({ type: 'restore-profile' }, async ({ accountId }) => {
        let restore = restoreRef.current;
        if (restore?.authKey !== authLifecycleKey || restore.accountId !== accountId) {
          restore = reduceProfileRestoreState(restore, {
            type: 'restore-started',
            authKey: authLifecycleKey,
            accountId,
            promise: identityChange.cleanupPromise
              .then(() => readSelectedProfile())
              .catch(() => null),
          });
          restoreRef.current = restore;
        }

        const persistedProfileId = await match(restore)
          .with({ phase: 'reading' }, ({ promise }) => promise)
          .with({ phase: 'applied' }, () => identityChange.cleanupPromise.then(() => null))
          .exhaustive();
        if (!active || restoreRef.current !== restore) {
          return;
        }

        restoreRef.current = reduceProfileRestoreState(restore, {
          type: 'restore-read-completed',
          authKey: authLifecycleKey,
          accountId,
        });
        const profileId = persistedProfileId || serverSelectedProfileId;
        if (!profileId) {
          return;
        }

        if (!persistedProfileId) {
          void writeSelectedProfile(profileId);
        }
        resetActor(profileId);
      })
      .exhaustive();

    return deactivate;
  }, [
    accountId,
    actorLifecycleKey,
    actorSelectedProfileId,
    authLifecycleKey,
    onSessionChange,
    resetActor,
    resetRejectedCurrentActor,
    serverSelectedProfileId,
    session,
    sessionId,
  ]);

  return null;
}

function SessionErrorReporter({
  authLifecycleKey,
  actorLifecycleKey,
  onError,
}: {
  authLifecycleKey: string;
  actorLifecycleKey: string;
  onError: (authLifecycleKey: string, actorLifecycleKey: string) => void;
}) {
  useEffect(
    () => onError(authLifecycleKey, actorLifecycleKey),
    [actorLifecycleKey, authLifecycleKey, onError],
  );
  return null;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

export function useAnalyticsIdentityAccountId(): string | null {
  return useContext(AnalyticsIdentityAccountContext);
}

export function SessionErrorProvider({ children }: PropsWithChildren) {
  return <SessionContext.Provider value={errorSession}>{children}</SessionContext.Provider>;
}
