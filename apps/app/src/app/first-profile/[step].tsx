import { Link, Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useFirstProfileOnboarding } from '@/components/onboarding/FirstProfileOnboardingRoute';
import { FirstProfileOnboardingScreen } from '@/components/onboarding/FirstProfileOnboardingScreen';
import { firstProfileSteps } from '@/components/onboarding/firstProfileOnboardingState';
import { Button } from '@/components/ui/Button';
import { getPublicWebOrigin } from '@/config/origin';
import type { Href } from 'expo-router';
import type { FirstProfileStep } from '@/components/onboarding/firstProfileOnboardingState';

export default function FirstProfileStepRoute() {
  const { step } = useLocalSearchParams<{ step: string }>();
  const router = useRouter();
  const flow = useFirstProfileOnboarding();
  usePreventRemove(flow.busy, () => undefined);
  if (step !== 'complete' && !firstProfileSteps.includes(step as FirstProfileStep)) {
    return <Redirect href="/first-profile/handle" />;
  }
  const current = step as FirstProfileStep | 'complete';
  const next = () =>
    router.push(
      `/first-profile/${firstProfileSteps[firstProfileSteps.indexOf(current as FirstProfileStep) + 1] ?? 'review'}` as Href,
    );
  return (
    <FirstProfileOnboardingScreen
      avatar={flow.images.avatar.presentation}
      header={flow.images.header.presentation}
      busy={flow.busy}
      created={flow.createdProfile !== null}
      draft={flow.draft}
      errors={flow.errors}
      onBack={() =>
        router.canGoBack()
          ? router.back()
          : router.replace(
              (current === 'complete'
                ? `/first-profile/${flow.completedFrom}`
                : firstProfileSteps.indexOf(current) > 0
                  ? `/first-profile/${firstProfileSteps[firstProfileSteps.indexOf(current) - 1]}`
                  : '/local') as Href,
            )
      }
      onChange={flow.setDraft}
      onComplete={() => {
        if (
          flow.complete(current === 'complete' ? flow.completedFrom : current) &&
          current !== 'complete'
        ) {
          router.push('/first-profile/complete');
        }
      }}
      onNext={() => {
        if (current !== 'complete' && flow.validateStep(current)) {
          next();
        }
      }}
      onSkip={next}
      onAvatarEdit={() => {
        void flow.pickImage('avatar');
      }}
      onAvatarRemove={() => flow.removeImage('avatar')}
      onAvatarRetry={() => flow.retryImage('avatar')}
      onHeaderEdit={() => {
        void flow.pickImage('header');
      }}
      onHeaderRemove={() => flow.removeImage('header')}
      onHeaderRetry={() => flow.retryImage('header')}
      result={flow.result}
      startAction={
        <Link asChild href="/home">
          <Button>시작하기</Button>
        </Link>
      }
      step={current}
      webHost={new URL(getPublicWebOrigin()).host}
    />
  );
}
