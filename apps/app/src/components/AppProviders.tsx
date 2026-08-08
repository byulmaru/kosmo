import { useEffect } from 'react';
import { AnalyticsSessionBridge } from '@/analytics/AnalyticsSessionBridge';
import { initializeAnalytics } from '@/analytics/client';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { SessionRecoveryProvider } from '@/session/SessionRecoveryCoordinator';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { GraphQLErrorBoundary } from './GraphQLErrorBoundary';
import { PostContentWarningRevealProvider } from './post/PostContentWarningRevealContext';
import { ToastProvider } from './ui/ToastProvider';
import type { PropsWithChildren } from 'react';

function RelaySessionBoundary({ children }: PropsWithChildren) {
  return (
    <GraphQLErrorBoundary>
      <SessionProvider>
        <AnalyticsSessionBridge />
        <PostContentWarningRevealProvider>{children}</PostContentWarningRevealProvider>
      </SessionProvider>
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
          <SessionRecoveryProvider>
            <RelaySessionBoundary>{children}</RelaySessionBoundary>
          </SessionRecoveryProvider>
        </RelayActorProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
