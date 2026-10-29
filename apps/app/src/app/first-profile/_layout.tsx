import { Stack } from 'expo-router';
import { FirstProfileOnboardingRoute } from '@/components/onboarding/FirstProfileOnboardingRoute';

export default function FirstProfileLayout() {
  return (
    <FirstProfileOnboardingRoute>
      <Stack screenOptions={{ headerShown: false }} />
    </FirstProfileOnboardingRoute>
  );
}
