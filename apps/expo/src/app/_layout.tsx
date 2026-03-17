import { ClientProvider } from '@mearie/react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import I18nProvider from '@/components/provider/I18nProvider';
import { client } from '@/lib/graphql/client';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClientProvider client={client}>
        <I18nProvider>
          <SafeAreaProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </SafeAreaProvider>
        </I18nProvider>
      </ClientProvider>
    </GestureHandlerRootView>
  );
}
