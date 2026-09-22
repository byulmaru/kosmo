import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
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
import type { PropsWithChildren } from 'react';
import type { SessionProviderQuery as SessionProviderQueryType } from './__generated__/SessionProviderQuery.graphql';

type SessionValue = {
  accountId: string | null;
  accountName: string | null;
  selectedProfileId: string | null;
  sessionId: string | null;
  status: 'error' | 'guest' | 'valid';
};

type SessionState = {
  authLifecycleKey: string;
  actorLifecycleKey: string;
  ready: boolean;
  value: SessionValue;
};

type SessionChange = {
  accountChanged: boolean;
  cleanupPromise: Promise<void>;
};

type ProfileRestoreState = {
  authKey: string;
  accountId: string;
  promise: Promise<string | null>;
  applied: boolean;
};

const guestSession: SessionValue = {
  accountId: null,
  accountName: null,
  selectedProfileId: null,
  sessionId: null,
  status: 'guest',
};
const errorSession: SessionValue = { ...guestSession, status: 'error' };
const SessionContext = createContext<SessionValue>(guestSession);
const AnalyticsAccountContext = createContext<string | null>(null);
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
  const authLifecycleKey = useRelayAuthLifecycleKey();
  const actorLifecycleKey = useRelayActorLifecycleKey();
  const lifecycleKeysRef = useRef({ authLifecycleKey, actorLifecycleKey });
  lifecycleKeysRef.current = { authLifecycleKey, actorLifecycleKey };
  const [sessionState, setSessionState] = useState<SessionState>(() => ({
    authLifecycleKey,
    actorLifecycleKey,
    ready: false,
    value: guestSession,
  }));
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

      setSessionState({
        authLifecycleKey: authKey,
        actorLifecycleKey: actorKey,
        ready: true,
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

    setSessionState((previous) => ({
      authLifecycleKey: authKey,
      actorLifecycleKey: actorKey,
      ready: true,
      value:
        previous.authLifecycleKey === authKey && previous.ready
          ? { ...previous.value, selectedProfileId: null }
          : errorSession,
    }));
  }, []);
  const visibleSession =
    sessionState.authLifecycleKey !== authLifecycleKey
      ? errorSession
      : sessionState.actorLifecycleKey === actorLifecycleKey
        ? sessionState.value
        : { ...sessionState.value, selectedProfileId: null };

  return (
    <AnalyticsIdentityAccountContext.Provider value={sessionState.value.accountId}>
      <AnalyticsAccountContext.Provider value={visibleSession.accountId}>
    <SessionContext.Provider value={visibleSession}>
      <RelayFailOpenBoundary
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
            authLifecycleKey={authLifecycleKey}
            actorLifecycleKey={actorLifecycleKey}
            onSessionChange={setSession}
            restoreRef={restoreRef}
          />
        </Suspense>
      </RelayFailOpenBoundary>
      {sessionState.ready ? children : null}
    </SessionContext.Provider>
      </AnalyticsAccountContext.Provider>
    </AnalyticsIdentityAccountContext.Provider>
  );
}

function SessionQuery({
  authLifecycleKey,
  actorLifecycleKey,
  onSessionChange,
  restoreRef,
}: {
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
    selectedProfileId: actorSelectedProfileId,
  } = useRelayActor();
  const data = useLazyLoadQuery<SessionProviderQueryType>(
    SessionProviderQuery,
    {},
    { fetchPolicy: 'store-and-network' },
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

    const confirmedGuest = sessionId === null && accountId === null;
    if (confirmedGuest) {
      if (actorSelectedProfileId !== null) {
        resetActor(null);
      }
      return deactivate;
    }

    if (!sessionId || !accountId) {
      return deactivate;
    }

    if (identityChange.accountChanged && actorSelectedProfileId !== null) {
      resetActor(null);
      return deactivate;
    }

    if (actorSelectedProfileId !== null) {
      if (serverSelectedProfileId !== actorSelectedProfileId) {
        void identityChange.cleanupPromise.then(() => {
          if (!active) {
            return;
          }

          if (serverSelectedProfileId) {
            void writeSelectedProfile(serverSelectedProfileId);
            resetActor(serverSelectedProfileId);
          } else {
            const currentRestore = restoreRef.current;
            if (
              currentRestore?.authKey === authLifecycleKey &&
              currentRestore.accountId === accountId
            ) {
              currentRestore.applied = true;
            } else {
              restoreRef.current = {
                authKey: authLifecycleKey,
                accountId,
                promise: Promise.resolve(null),
                applied: true,
              };
            }
            resetActor(null);
          }
        });
      }

      return deactivate;
    }

    let restore = restoreRef.current;
    if (restore?.authKey !== authLifecycleKey || restore.accountId !== accountId) {
      restore = {
        authKey: authLifecycleKey,
        accountId,
        promise: identityChange.cleanupPromise.then(() => readSelectedProfile()).catch(() => null),
        applied: false,
      };
      restoreRef.current = restore;
    }

    if (restore.applied) {
      if (serverSelectedProfileId) {
        void identityChange.cleanupPromise.then(() => {
          if (!active || restoreRef.current !== restore) {
            return;
          }

          void writeSelectedProfile(serverSelectedProfileId);
          resetActor(serverSelectedProfileId);
        });
      }
      return deactivate;
    }

    void restore.promise.then((persistedProfileId) => {
      if (!active || restoreRef.current !== restore) {
        return;
      }

      restore.applied = true;
      if (persistedProfileId) {
        resetActor(persistedProfileId);
      } else if (serverSelectedProfileId) {
        void writeSelectedProfile(serverSelectedProfileId);
        resetActor(serverSelectedProfileId);
      }
    });

    return deactivate;
  }, [
    accountId,
    actorLifecycleKey,
    actorSelectedProfileId,
    authLifecycleKey,
    onSessionChange,
    resetActor,
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

export function useAnalyticsAccountId(): string | null {
  return useContext(AnalyticsAccountContext);
}

export function useAnalyticsIdentityAccountId(): string | null {
  return useContext(AnalyticsIdentityAccountContext);
}

export function SessionErrorProvider({ children }: PropsWithChildren) {
  return <SessionContext.Provider value={errorSession}>{children}</SessionContext.Provider>;
}
