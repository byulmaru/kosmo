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
import { useRelayActor, useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
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
  const actorLifecycleKey = useRelayActorLifecycleKey();
  const actorLifecycleKeyRef = useRef(actorLifecycleKey);
  actorLifecycleKeyRef.current = actorLifecycleKey;
  const [sessionState, setSessionState] = useState<SessionState>(() => ({
    actorLifecycleKey,
    ready: false,
    value: guestSession,
  }));
  const setSession = useCallback((lifecycleKey: string, value: SessionValue) => {
    if (lifecycleKey !== actorLifecycleKeyRef.current) {
      return;
    }

    setSessionState({ actorLifecycleKey: lifecycleKey, ready: true, value });
  }, []);
  const setSessionError = useCallback(
    (lifecycleKey: string) => setSession(lifecycleKey, errorSession),
    [setSession],
  );
  const visibleSession =
    sessionState.actorLifecycleKey === actorLifecycleKey ? sessionState.value : errorSession;

  return (
    <SessionContext.Provider value={visibleSession}>
      <RelayFailOpenBoundary
        fallback={
          <SessionErrorReporter lifecycleKey={actorLifecycleKey} onError={setSessionError} />
        }
      >
        <Suspense fallback={<Splash label="세션을 확인하는 중입니다." />}>
          <SessionQuery actorLifecycleKey={actorLifecycleKey} onSessionChange={setSession} />
        </Suspense>
      </RelayFailOpenBoundary>
      {sessionState.ready ? children : null}
    </SessionContext.Provider>
  );
}

function SessionQuery({
  actorLifecycleKey,
  onSessionChange,
}: {
  actorLifecycleKey: string;
  onSessionChange: (lifecycleKey: string, value: SessionValue) => void;
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
      void clearNativeSession();
    }
  }, [clearNativeSession, nativeToken, sessionId]);

  useEffect(
    () => onSessionChange(actorLifecycleKey, session),
    [actorLifecycleKey, onSessionChange, session],
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
  }, [accountId, actorSelectedProfileId, resetActor, serverSelectedProfileId, sessionId]);

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
  }, [accountId, actorSelectedProfileId, resetActor, serverSelectedProfileId, sessionId]);

  return null;
}

function SessionErrorReporter({
  lifecycleKey,
  onError,
}: {
  lifecycleKey: string;
  onError: (lifecycleKey: string) => void;
}) {
  useEffect(() => onError(lifecycleKey), [lifecycleKey, onError]);
  return null;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

export function SessionErrorProvider({ children }: PropsWithChildren) {
  return <SessionContext.Provider value={errorSession}>{children}</SessionContext.Provider>;
}
