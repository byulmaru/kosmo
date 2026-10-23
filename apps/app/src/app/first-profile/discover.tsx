import { Redirect, useRouter } from 'expo-router';
import { useFirstProfileOnboarding } from '@/components/onboarding/FirstProfileOnboardingRoute';
import { FirstProfileTagDiscoveryRoute } from '@/components/onboarding/FirstProfileTagDiscoveryRoute';

export default function FirstProfileDiscoveryRoute() {
  const flow = useFirstProfileOnboarding();
  const router = useRouter();
  if (!flow.createdProfile || !flow.profileSelected || flow.result.kind !== 'success') {
    return <Redirect href="/first-profile/handle" />;
  }
  return (
    <FirstProfileTagDiscoveryRoute
      empty={<Redirect href="/first-profile/complete" />}
      onContinue={() => router.push('/first-profile/complete')}
      profileId={flow.createdProfile.id}
    />
  );
}
