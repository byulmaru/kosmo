import { Suspense, useEffect } from 'react';
import { AnalyticsSessionBridge } from '@/analytics/AnalyticsSessionBridge';
import { initializeAnalytics } from '@/analytics/client';
import { ShellRefreshCoordinatorProvider } from '@/components/shell/ShellRefreshCoordinator';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
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
  return (
    <GraphQLErrorBoundary>
      <SessionFailOpenBoundary
        fallback={
          <SessionErrorProvider>
            <AnalyticsSessionBridge />
            <PostContentWarningRevealProvider>{children}</PostContentWarningRevealProvider>
          </SessionErrorProvider>
        }
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
    <ThemeProvider>
      <ToastProvider>
        <RelayActorProvider>
          <ShellRefreshCoordinatorProvider>
            <RelaySessionBoundary>{children}</RelaySessionBoundary>
          </ShellRefreshCoordinatorProvider>
        </RelayActorProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
