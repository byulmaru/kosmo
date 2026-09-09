import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { AppProviders } from '@/components/AppProviders';
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AppProviders>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </AppProviders>
  );
}
