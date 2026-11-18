import { Stack } from 'expo-router';
import { UniversalShell } from '@/components/shell/UniversalShell';

export const unstable_settings = {
  initialRouteName: '(protected)',
};

export default function TabsLayout() {
  return (
    <UniversalShell>
      <Stack screenOptions={{ headerShown: false }} />
    </UniversalShell>
  );
}
