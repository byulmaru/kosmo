import '../../global.css';

import { ClientProvider } from '@mearie/react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { client } from '@/lib/graphql/clinet';

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
