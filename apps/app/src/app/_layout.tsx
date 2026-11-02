import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { AppProviders } from '@/components/AppProviders';
import { fontAssets } from '@/theme/fontAssets';
import { useThemeMode } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [themeReady, setThemeReady] = useState(false);
  const onThemeReady = useCallback(() => setThemeReady(true), []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && themeReady) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded, themeReady]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AppProviders onThemeReady={onThemeReady}>
      <ThemeStatusBar />
      <Stack screenOptions={{ headerShown: false }} />
    </AppProviders>
  );
}

function ThemeStatusBar() {
  const mode = useThemeMode();
  return <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />;
}
