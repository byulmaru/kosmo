import { createContext, useContext, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Platform } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import { useRelayActor } from '@/relay/RelayActorProvider';
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

const SessionContext = createContext<SessionValue>({
  accountId: null,
  accountName: null,
  selectedProfileId: null,
  sessionId: null,
  status: 'guest',
});

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
  const { clearNativeSession, nativeToken } = useRelayActor();
  const recoveryGeneration = useSessionRecoveryGeneration();
  const data = useLazyLoadQuery<SessionProviderQueryType>(
    SessionProviderQuery,
    {},
    { fetchKey: recoveryGeneration, fetchPolicy: 'store-and-network' },
  );
  const sessionId = data.currentSession?.id ?? null;

  useEffect(() => {
    if (Platform.OS !== 'web' && nativeToken && !sessionId) {
      void clearNativeSession();
    }
  }, [clearNativeSession, nativeToken, sessionId]);

  return (
    <SessionContext.Provider
      value={{
        accountId: data.me?.id ?? null,
        accountName: data.me?.name ?? null,
        selectedProfileId: data.currentSession?.selectedProfile?.id ?? null,
        sessionId,
        status: sessionId ? 'valid' : 'guest',
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

export function SessionErrorProvider({ children }: PropsWithChildren) {
  return (
    <SessionContext.Provider
      value={{
        accountId: null,
        accountName: null,
        selectedProfileId: null,
        sessionId: null,
        status: 'error',
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function SessionFailOpenBoundary({
  children,
  fallback,
}: PropsWithChildren<{ fallback: ReactNode }>) {
  const reportUnexpectedError = useUnexpectedErrorReporter();
  const recoveryGeneration = useSessionRecoveryGeneration();

  return (
    <ErrorBoundary
      fallback={fallback}
      onError={reportUnexpectedError}
      resetKeys={[recoveryGeneration]}
    >
      {children}
    </ErrorBoundary>
  );
}
