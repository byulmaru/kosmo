import { DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { AnalyticsSessionBridge } from '@/analytics/AnalyticsSessionBridge';
import { deleteSelectedProfile } from '@/auth/selectedProfileStorage';
import { ContentReportProvider } from '@/components/content-report/ContentReportContext';
import { FeatureFlagsProvider } from '@/components/FeatureFlagsContext';
import { NativePushProvider } from '@/components/native-push/NativePushProvider';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import {
  ThemePreferenceProvider,
  useClearThemeStorageError,
  useThemeStorageError,
} from '@/theme/ThemePreferenceProvider';
import { useTheme, useThemeMode } from '@/theme/ThemeProvider';
import { GraphQLErrorBoundary } from './GraphQLErrorBoundary';
import { PostContentWarningRevealProvider } from './post/PostContentWarningRevealContext';
import { ToastProvider, useToast } from './ui/ToastProvider';
import type { PropsWithChildren } from 'react';

const resetSelectedProfileParam = 'resetSelectedProfile';

export function AppProviders({
  children,
  onThemeReady,
}: PropsWithChildren<{ onThemeReady?: () => void }>) {
  const [resetSelectedProfilePending, setResetSelectedProfilePending] = useState(
    () =>
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      new URL(window.location.href).searchParams.get(resetSelectedProfileParam) === '1',
  );

  useEffect(() => {
    if (!resetSelectedProfilePending) {
      return;
    }

    let active = true;
    void (async () => {
      await deleteSelectedProfile();
      if (!active) {
        return;
      }

      const url = new URL(window.location.href);
      url.searchParams.delete(resetSelectedProfileParam);
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
      setResetSelectedProfilePending(false);
    })();

    return () => {
      active = false;
    };
  }, [resetSelectedProfilePending]);

  return (
    <ThemePreferenceProvider onHydrated={onThemeReady}>
      {resetSelectedProfilePending ? null : (
        <NavigationThemeBoundary>
          <ToastProvider>
            <ThemeStorageErrorToast />
            <GraphQLErrorBoundary>
              <RelayActorProvider>
                <SessionProvider>
                  <FeatureFlagsProvider>
                    <AnalyticsSessionBridge />
                    <NativePushProvider>
                      <ContentReportProvider>
                        <PostContentWarningRevealProvider>
                          {children}
                        </PostContentWarningRevealProvider>
                      </ContentReportProvider>
                    </NativePushProvider>
                  </FeatureFlagsProvider>
                </SessionProvider>
              </RelayActorProvider>
            </GraphQLErrorBoundary>
          </ToastProvider>
        </NavigationThemeBoundary>
      )}
    </ThemePreferenceProvider>
  );
}

function ThemeStorageErrorToast() {
  const error = useThemeStorageError();
  const clearError = useClearThemeStorageError();
  const { showToast } = useToast();

  useEffect(() => {
    if (!error) {
      return;
    }

    showToast(
      error === 'read'
        ? '테마 설정을 불러오지 못했어요. 시스템 설정으로 시작합니다.'
        : '테마 설정을 저장하지 못했어요. 현재 선택은 유지됩니다.',
      { tone: 'danger' },
    );
    clearError();
  }, [clearError, error, showToast]);

  return null;
}

function NavigationThemeBoundary({ children }: PropsWithChildren) {
  const theme = useTheme();
  const mode = useThemeMode();

  return (
    <NavigationThemeProvider
      value={{
        ...DefaultTheme,
        dark: mode === 'dark',
        colors: {
          ...DefaultTheme.colors,
          background: theme.backgroundCanvas,
          border: theme.borderDefault,
          card: theme.backgroundSurface,
          notification: theme.feedbackDangerBase,
          primary: theme.actionPrimaryBase,
          text: theme.foregroundPrimary,
        },
      }}
    >
      {children}
    </NavigationThemeProvider>
  );
}
