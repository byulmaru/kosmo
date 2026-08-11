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
import { PostContentWarningRevealProvider } from './post/PostContentWarningRevealContext';
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
            <PostContentWarningRevealProvider>{children}</PostContentWarningRevealProvider>
          </SessionErrorProvider>
        }
        resetKey={revision}
      >
        <Suspense fallback={<Splash label="세션을 확인하는 중입니다." />}>
          <SessionProvider>
            <AnalyticsSessionBridge />
            <PostContentWarningRevealProvider>{children}</PostContentWarningRevealProvider>
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
    <ThemeProvider mode="light">
      <ToastProvider>
        <RelayActorProvider>
          <RelaySessionBoundary>{children}</RelaySessionBoundary>
        </RelayActorProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
