import { Slot, Stack } from 'expo-router';
import { Platform } from 'react-native';
import { UniversalShell } from '@/components/shell/UniversalShell';

export const unstable_settings = {
  initialRouteName: '(protected)',
};

export default function TabsLayout() {
  return (
    <UniversalShell>
      {Platform.OS === 'web' ? <Slot /> : <Stack screenOptions={{ headerShown: false }} />}
    </UniversalShell>
  );
}
