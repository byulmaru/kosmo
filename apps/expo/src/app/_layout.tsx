import '../../global.css';
import '@kosmo/core/polyfill';

import { ClientProvider } from '@mearie/react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { client } from '@/lib/graphql/client';

export default function RootLayout() {
  return (
    <ClientProvider client={client}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </SafeAreaProvider>
    </ClientProvider>
  );
}
