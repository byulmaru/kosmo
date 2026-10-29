import { Slot, Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function ProfileRouteLayout() {
  return Platform.OS === 'web' ? <Slot /> : <Stack screenOptions={{ headerShown: false }} />;
}
