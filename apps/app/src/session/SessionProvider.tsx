import { createContext, useContext, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Platform } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import { useRelayActor } from '@/relay/RelayActorProvider';
import type { PropsWithChildren, ReactNode } from 'react';
import type { SessionProviderQuery as SessionProviderQueryType } from './__generated__/SessionProviderQuery.graphql';

type SessionValue = {
  accountName: string | null;
  selectedProfileId: string | null;
  sessionId: string | null;
  status: 'error' | 'guest' | 'valid';
};

const SessionContext = createContext<SessionValue>({
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
  const { clearNativeSession, nativeToken, revision } = useRelayActor();
  const data = useLazyLoadQuery<SessionProviderQueryType>(
    SessionProviderQuery,
    {},
    { fetchKey: revision, fetchPolicy: 'store-and-network' },
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
      value={{ accountName: null, selectedProfileId: null, sessionId: null, status: 'error' }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function SessionFailOpenBoundary({
  children,
  fallback,
  resetKey,
}: PropsWithChildren<{ fallback: ReactNode; resetKey: number }>) {
  const reportUnexpectedError = useUnexpectedErrorReporter();

  return (
    <ErrorBoundary fallback={fallback} onError={reportUnexpectedError} resetKeys={[resetKey]}>
      {children}
    </ErrorBoundary>
  );
}
