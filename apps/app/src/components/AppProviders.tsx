import { Suspense, useEffect } from 'react';
import { AnalyticsSessionBridge } from '@/analytics/AnalyticsSessionBridge';
import { initializeAnalytics } from '@/analytics/client';
import { RelayActorProvider, useRelayActor } from '@/relay/RelayActorProvider';
import {
  SessionErrorProvider,
  SessionFailOpenBoundary,
  SessionProvider,
} from '@/session/SessionProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { GraphQLErrorBoundary } from './GraphQLErrorBoundary';
import { Splash } from './Splash';
import { ToastProvider } from './ui/ToastProvider';
import type { PropsWithChildren } from 'react';

function RelaySessionBoundary({ children }: PropsWithChildren) {
  const { retry, revision } = useRelayActor();

  return (
    <GraphQLErrorBoundary onRetry={retry}>
      <SessionFailOpenBoundary
        fallback={
          <SessionErrorProvider>
            <AnalyticsSessionBridge />
            {children}
          </SessionErrorProvider>
        }
        resetKey={revision}
      >
        <Suspense fallback={<Splash label="세션을 확인하는 중입니다." />}>
          <SessionProvider>
            <AnalyticsSessionBridge />
            {children}
          </SessionProvider>
        </Suspense>
      </SessionFailOpenBoundary>
    </GraphQLErrorBoundary>
  );
}

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    initializeAnalytics();
  }, []);

  return (
    <ThemeProvider>
      <ToastProvider>
        <RelayActorProvider>
          <RelaySessionBoundary>{children}</RelaySessionBoundary>
        </RelayActorProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
