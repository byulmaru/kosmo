import { AnalyticsSessionBridge } from '@/analytics/AnalyticsSessionBridge';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { GraphQLErrorBoundary } from './GraphQLErrorBoundary';
import { PostContentWarningRevealProvider } from './post/PostContentWarningRevealContext';
import { UnreadNotificationBadgeStateProvider } from './shell/UnreadNotificationBadgeController';
import { ToastProvider } from './ui/ToastProvider';
import type { PropsWithChildren } from 'react';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider mode="light">
      <ToastProvider>
        <UnreadNotificationBadgeStateProvider>
          <GraphQLErrorBoundary>
            <RelayActorProvider>
              <SessionProvider>
                <AnalyticsSessionBridge />
                <PostContentWarningRevealProvider>{children}</PostContentWarningRevealProvider>
              </SessionProvider>
            </RelayActorProvider>
          </GraphQLErrorBoundary>
        </UnreadNotificationBadgeStateProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
