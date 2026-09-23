import { DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { AnalyticsSessionBridge } from '@/analytics/AnalyticsSessionBridge';
import { ContentReportProvider } from '@/components/content-report/ContentReportContext';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { GraphQLErrorBoundary } from './GraphQLErrorBoundary';
import { PostContentWarningRevealProvider } from './post/PostContentWarningRevealContext';
import { ToastProvider } from './ui/ToastProvider';
import type { PropsWithChildren } from 'react';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider mode="light">
      <NavigationThemeBoundary>
        <ToastProvider>
          <GraphQLErrorBoundary>
            <RelayActorProvider>
              <SessionProvider>
                <AnalyticsSessionBridge />
                <ContentReportProvider>
                  <PostContentWarningRevealProvider>{children}</PostContentWarningRevealProvider>
                </ContentReportProvider>
              </SessionProvider>
            </RelayActorProvider>
          </GraphQLErrorBoundary>
        </ToastProvider>
      </NavigationThemeBoundary>
    </ThemeProvider>
  );
}

function NavigationThemeBoundary({ children }: PropsWithChildren) {
  const theme = useTheme();

  return (
    <NavigationThemeProvider
      value={{
        ...DefaultTheme,
        colors: { ...DefaultTheme.colors, background: theme.backgroundCanvas },
      }}
    >
      {children}
    </NavigationThemeProvider>
  );
}
