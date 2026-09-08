import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { AppProviders } from '@/components/AppProviders';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const fontAssets = Platform.select<Record<string, number>>({
  ios: {
    // expo-font's iOS family alias maps a runtime alias to one registered face.
    // Loader-only static face keys let UIFont resolve the full family and its weights.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
    'Pretendard-Regular': require('pretendard/dist/public/static/alternative/Pretendard-Regular.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
    'SUIT-Bold': require('@sun-typeface/suit/fonts/static/ttf/SUIT-Bold.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
    'SUIT-ExtraBold': require('@sun-typeface/suit/fonts/static/ttf/SUIT-ExtraBold.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
    'SUIT-Regular': require('@sun-typeface/suit/fonts/static/ttf/SUIT-Regular.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
    'SUIT-SemiBold': require('@sun-typeface/suit/fonts/static/ttf/SUIT-SemiBold.ttf'),
  },
  default: {
    // Android and Web continue to use the variable assets under their consumer names.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
    Pretendard: require('pretendard/dist/public/variable/PretendardVariable.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
    SUIT: require('@sun-typeface/suit/fonts/variable/ttf/SUIT-Variable.ttf'),
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
