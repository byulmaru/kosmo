import { useEffect } from 'react';
import { AnalyticsSessionBridge } from '@/analytics/AnalyticsSessionBridge';
import { initializeAnalytics } from '@/analytics/client';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { GraphQLErrorBoundary } from './GraphQLErrorBoundary';
import { PostContentWarningRevealProvider } from './post/PostContentWarningRevealContext';
import { ToastProvider } from './ui/ToastProvider';
import type { PropsWithChildren } from 'react';

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    initializeAnalytics();
  }, []);

  return (
    <ThemeProvider mode="light">
      <ToastProvider>
        <GraphQLErrorBoundary>
          <RelayActorProvider>
            <SessionProvider>
              <AnalyticsSessionBridge />
              <PostContentWarningRevealProvider>{children}</PostContentWarningRevealProvider>
            </SessionProvider>
          </RelayActorProvider>
        </GraphQLErrorBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}
