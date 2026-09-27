import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { AppProviders } from '@/components/AppProviders';
import { useThemeMode } from '@/theme/ThemeProvider';
import { fontFamilies } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Keep one Metro asset reference per package font; only the platform-specific
// registration key changes below.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
const pretendardAsset = require('pretendard/dist/public/variable/PretendardVariable.ttf');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
const suitAsset = require('@sun-typeface/suit/fonts/variable/ttf/SUIT-Variable.ttf');

const fontAssets = Platform.select<Record<string, number>>({
  ios: {
    // Keep aliases distinct from the fonts' internal family names so expo-font's
    // alias swizzle does not shadow UIFont's variable family lookup.
    Pretendard: pretendardAsset,
    SUIT: suitAsset,
  },
  default: {
    // Android and Web register the variable assets under the shared consumer names.
    [fontFamilies.content]: pretendardAsset,
    [fontFamilies.ui]: suitAsset,
  },
});

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
