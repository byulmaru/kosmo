import { Suspense } from 'react';
import { RelayActorProvider, useRelayActor } from '@/relay/RelayActorProvider';
import {
  SessionErrorProvider,
  SessionFailOpenBoundary,
  SessionProvider,
} from '@/session/SessionProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { GraphQLErrorBoundary } from './GraphQLErrorBoundary';
import { Splash } from './Splash';
import type { PropsWithChildren } from 'react';

function RelaySessionBoundary({ children }: PropsWithChildren) {
  const { retry, revision } = useRelayActor();

  return (
    <GraphQLErrorBoundary onRetry={retry}>
      <SessionFailOpenBoundary
        fallback={<SessionErrorProvider>{children}</SessionErrorProvider>}
        resetKey={revision}
      >
        <Suspense fallback={<Splash label="세션을 확인하는 중입니다." />}>
          <SessionProvider>{children}</SessionProvider>
        </Suspense>
      </SessionFailOpenBoundary>
    </GraphQLErrorBoundary>
  );
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <RelayActorProvider>
        <RelaySessionBoundary>{children}</RelaySessionBoundary>
      </RelayActorProvider>
    </ThemeProvider>
  );
}
