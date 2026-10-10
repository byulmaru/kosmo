import { Stack } from 'expo-router';

export const unstable_settings = {
  anchor: 'home',
  account: { anchor: '[profileHandle]' },
  home: { anchor: 'home' },
  notifications: { anchor: 'notifications' },
  'primary-search': { anchor: 'search' },
};

export default function NativeTabStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
