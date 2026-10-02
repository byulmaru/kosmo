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

const guestSession: SessionValue = {
  accountId: null,
  accountName: null,
  selectedProfileId: null,
  sessionId: null,
  status: 'guest',
};
const errorSession: SessionValue = { ...guestSession, status: 'error' };
const SessionContext = createContext<SessionValue>(guestSession);

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
  const setSession = useCallback((authKey: string, actorKey: string, value: SessionValue) => {
    const currentKeys = lifecycleKeysRef.current;
    if (authKey !== currentKeys.authLifecycleKey || actorKey !== currentKeys.actorLifecycleKey) {
      return;
    }

    setSessionState({
      authLifecycleKey: authKey,
      actorLifecycleKey: actorKey,
      ready: true,
      value,
    });
  }, []);
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
          />
        </Suspense>
      </RelayFailOpenBoundary>
      {sessionState.ready ? children : null}
    </SessionContext.Provider>
  );
}

function SessionQuery({
  authLifecycleKey,
  actorLifecycleKey,
  onSessionChange,
}: {
  authLifecycleKey: string;
  actorLifecycleKey: string;
  onSessionChange: (
    authLifecycleKey: string,
    actorLifecycleKey: string,
    value: SessionValue,
  ) => void;
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
      selectedProfileId: serverSelectedProfileId,
      sessionId,
      status: sessionId ? ('valid' as const) : ('guest' as const),
    }),
    [accountId, data.me?.name, serverSelectedProfileId, sessionId],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' && nativeToken && !sessionId) {
      void clearNativeSession().catch(() => undefined);
    }
  }, [authLifecycleKey, clearNativeSession, nativeToken, sessionId]);

  useEffect(
    () => onSessionChange(authLifecycleKey, actorLifecycleKey, session),
    [actorLifecycleKey, authLifecycleKey, onSessionChange, session],
  );

  useEffect(() => {
    if (!sessionId || !accountId || actorSelectedProfileId !== null) {
      return;
    }

    let active = true;
    void readSelectedProfile({ accountId, sessionId }).then(
      (persistedProfileId) => {
        if (!active) {
          return;
        }

        if (persistedProfileId) {
          resetActor(persistedProfileId);
        } else if (serverSelectedProfileId) {
          void writeSelectedProfile({ accountId, sessionId }, serverSelectedProfileId);
          resetActor(serverSelectedProfileId);
        }
      },
      () => {
        if (active && serverSelectedProfileId) {
          resetActor(serverSelectedProfileId);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [
    accountId,
    actorLifecycleKey,
    actorSelectedProfileId,
    authLifecycleKey,
    resetActor,
    serverSelectedProfileId,
    sessionId,
  ]);

  useEffect(() => {
    if (actorSelectedProfileId === null) {
      return;
    }

    if (!sessionId || !accountId) {
      void deleteSelectedProfile();
      resetActor(null);
      return;
    }

    if (serverSelectedProfileId === actorSelectedProfileId) {
      return;
    }

    if (serverSelectedProfileId) {
      void writeSelectedProfile({ accountId, sessionId }, serverSelectedProfileId);
    } else {
      void deleteSelectedProfile();
    }
    resetActor(serverSelectedProfileId);
  }, [
    accountId,
    actorLifecycleKey,
    actorSelectedProfileId,
    authLifecycleKey,
    resetActor,
    serverSelectedProfileId,
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

export function SessionErrorProvider({ children }: PropsWithChildren) {
  return <SessionContext.Provider value={errorSession}>{children}</SessionContext.Provider>;
}
