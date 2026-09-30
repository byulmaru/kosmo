import { Slot, Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function ProfileGroupLayout() {
  return Platform.OS === 'web' ? <Slot /> : <Stack screenOptions={{ headerShown: false }} />;
}
