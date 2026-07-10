import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppProviders } from '@/components/AppProviders';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
    Pretendard: require('pretendard/dist/public/variable/PretendardVariable.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
    SUIT: require('@sun-typeface/suit/fonts/variable/ttf/SUIT-Variable.ttf'),
  });

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
