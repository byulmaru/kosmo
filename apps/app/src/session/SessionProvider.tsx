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
import { ErrorBoundary } from 'react-error-boundary';
import { Platform } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { Splash } from '@/components/Splash';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import { useRelayActor, useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import { useSessionRecoveryGeneration } from './SessionRecoveryCoordinator';
import type { PropsWithChildren, ReactNode } from 'react';
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
      <SessionFailOpenBoundary
        fallback={
          <SessionErrorReporter lifecycleKey={actorLifecycleKey} onError={setSessionError} />
        }
      >
        <Suspense fallback={<Splash label="세션을 확인하는 중입니다." />}>
          <SessionQuery actorLifecycleKey={actorLifecycleKey} onSessionChange={setSession} />
        </Suspense>
      </SessionFailOpenBoundary>
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
  const { clearNativeSession, nativeToken } = useRelayActor();
  const recoveryGeneration = useSessionRecoveryGeneration();
  const data = useLazyLoadQuery<SessionProviderQueryType>(
    SessionProviderQuery,
    {},
    { fetchKey: recoveryGeneration, fetchPolicy: 'store-and-network' },
  );
  const sessionId = data.currentSession?.id ?? null;
  const session = useMemo(
    () => ({
      accountId: data.me?.id ?? null,
      accountName: data.me?.name ?? null,
      selectedProfileId: data.currentSession?.selectedProfile?.id ?? null,
      sessionId,
      status: sessionId ? ('valid' as const) : ('guest' as const),
    }),
    [data.currentSession?.selectedProfile?.id, data.me?.id, data.me?.name, sessionId],
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

export function SessionFailOpenBoundary({
  children,
  fallback,
  resetKey,
}: PropsWithChildren<{ fallback: ReactNode; resetKey?: number }>) {
  const reportUnexpectedError = useUnexpectedErrorReporter();
  const actorLifecycleKey = useRelayActorLifecycleKey();
  const recoveryGeneration = useSessionRecoveryGeneration();

  return (
    <ErrorBoundary
      fallback={fallback}
      onError={reportUnexpectedError}
      resetKeys={[actorLifecycleKey, recoveryGeneration, resetKey]}
    >
      {children}
    </ErrorBoundary>
  );
}
