import { DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { AnalyticsSessionBridge } from '@/analytics/AnalyticsSessionBridge';
import { ContentReportProvider } from '@/components/content-report/ContentReportContext';
import { FeatureFlagsProvider } from '@/components/FeatureFlagsContext';
import { NativePushProvider } from '@/components/native-push/NativePushProvider';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { GraphQLErrorBoundary } from './GraphQLErrorBoundary';
import { PostContentWarningRevealProvider } from './post/PostContentWarningRevealContext';
import { ToastProvider } from './ui/ToastProvider';
import type { PropsWithChildren } from 'react';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <FeatureFlagsProvider>
      <ThemeProvider mode="light">
        <NavigationThemeBoundary>
          <ToastProvider>
            <GraphQLErrorBoundary>
              <RelayActorProvider>
                <SessionProvider>
                  <AnalyticsSessionBridge />
                  <NativePushProvider>
                    <ContentReportProvider>
                      <PostContentWarningRevealProvider>{children}</PostContentWarningRevealProvider>
                    </ContentReportProvider>
                  </NativePushProvider>
                </SessionProvider>
              </RelayActorProvider>
            </GraphQLErrorBoundary>
          </ToastProvider>
        </NavigationThemeBoundary>
      </ThemeProvider>
    </FeatureFlagsProvider>
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
