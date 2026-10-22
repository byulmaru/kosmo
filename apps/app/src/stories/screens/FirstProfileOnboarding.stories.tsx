import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { FirstProfileOnboardingScreen } from '@/components/onboarding/FirstProfileOnboardingScreen';
import {
  firstProfileSteps,
  initialFirstProfileDraft,
} from '@/components/onboarding/firstProfileOnboardingState';
import { Button } from '@/components/ui/Button';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FirstProfileOnboardingScreenProps } from '@/components/onboarding/FirstProfileOnboardingScreen';
import type {
  FirstProfileDraft,
  FirstProfileStep,
} from '@/components/onboarding/firstProfileOnboardingState';

function OnboardingStory({
  initialStep = 'handle',
  initialDraft = initialFirstProfileDraft,
  initialResult = { kind: 'idle' },
  busy = false,
}: {
  initialStep?: FirstProfileStep | 'complete';
  initialDraft?: FirstProfileDraft;
  initialResult?: FirstProfileOnboardingScreenProps['result'];
  busy?: boolean;
}) {
  const [step, setStep] = useState(initialStep);
  const [draft, setDraft] = useState(initialDraft);
  const [result, setResult] = useState(initialResult);
  const [created, setCreated] = useState(initialResult.kind === 'success');
  const [completedFrom, setCompletedFrom] = useState<FirstProfileStep>('handle');
  const next = () =>
    setStep(firstProfileSteps[firstProfileSteps.indexOf(step as FirstProfileStep) + 1] ?? 'review');
  return (
    <FirstProfileOnboardingScreen
      avatar={{ kind: 'current', previewUri: null }}
      header={{ kind: 'current', previewUri: null }}
      busy={busy}
      created={created}
      draft={draft}
      errors={{}}
      onBack={() => {
        setStep(
          step === 'complete'
            ? completedFrom
            : firstProfileSteps[Math.max(0, firstProfileSteps.indexOf(step) - 1)]!,
        );
      }}
      onChange={setDraft}
      onComplete={() => {
        if (step !== 'complete') {
          setCompletedFrom(step);
        }
        setCreated(true);
        setResult({ kind: 'success' });
        setStep('complete');
      }}
      onNext={next}
      onSkip={next}
      onAvatarEdit={() => undefined}
      onAvatarRemove={() => undefined}
      onAvatarRetry={() => undefined}
      onHeaderEdit={() => undefined}
      onHeaderRemove={() => undefined}
      onHeaderRetry={() => undefined}
      result={result}
      startAction={<Button>시작하기</Button>}
      step={step}
      webHost="kosmo.example"
    />
  );
}
const populated: FirstProfileDraft = {
  ...initialFirstProfileDraft,
  handle: 'spring',
  displayName: '봄',
  bio: '책과 애니메이션 이야기를 좋아해요.',
  tags: ['책', '애니메이션'],
};
const meta = {
  component: OnboardingStory,
  globals: { theme: 'light', viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  title: 'KOSMO/Screens/First Profile Onboarding',
} satisfies Meta<typeof OnboardingStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Handle: Story = {};
export const Details: Story = { args: { initialStep: 'details', initialDraft: populated } };
export const Tags: Story = { args: { initialStep: 'tags', initialDraft: populated } };
export const Posting: Story = { args: { initialStep: 'posting', initialDraft: populated } };
export const Review: Story = { args: { initialStep: 'review', initialDraft: populated } };
export const Saving: Story = {
  args: { initialStep: 'complete', initialDraft: populated, busy: true },
};
export const Failed: Story = {
  args: {
    initialStep: 'complete',
    initialDraft: populated,
    initialResult: {
      kind: 'error',
      message: '프로필을 저장하지 못했어요. 입력한 내용은 유지되니 다시 시도해 주세요.',
    },
  },
};
export const LongDark: Story = {
  args: {
    initialStep: 'review',
    initialDraft: {
      ...populated,
      displayName: '긴표시이름'.repeat(8),
      bio: '긴 소개와 태그는 화면 폭에 맞춰 줄바꿈해요. '.repeat(15),
      tags: ['애니메이션', '개발', '소설', '영화', '드로잉'],
    },
  },
  globals: { theme: 'dark' },
};
export const HandleOnlyCompletionAndReturn: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: '바로 시작' })).toBeDisabled();
    await userEvent.type(canvas.getByRole('textbox', { name: '핸들' }), 'spring');
    await userEvent.click(canvas.getByRole('button', { name: '바로 시작' }));
    await expect(canvas.getByRole('heading', { name: /첫 프로필이\s*준비됐어요/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '이전 화면' }));
    await expect(canvas.getByRole('textbox', { name: '핸들' })).toHaveValue('spring');
    await expect(canvas.getByRole('textbox', { name: '핸들' })).toHaveProperty('readOnly', true);
  },
};
export const DraftSurvivesStepsAndSkip: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: '핸들' }), 'spring');
    await userEvent.click(canvas.getByRole('button', { name: '다음' }));
    await userEvent.type(canvas.getByRole('textbox', { name: '표시 이름' }), '봄');
    await userEvent.type(canvas.getByRole('textbox', { name: '소개' }), '보존할 소개');
    await userEvent.click(canvas.getByRole('button', { name: '다음' }));
    await userEvent.type(canvas.getByRole('textbox', { name: '프로필 태그' }), '책');
    await userEvent.click(canvas.getByRole('button', { name: '추가' }));
    await expect(canvas.getByText('#책', { exact: true })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '지금은 건너뛰기' }));
    await userEvent.click(canvas.getByRole('radio', { name: /팔로워만:/ }));
    await userEvent.click(canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' }));
    await userEvent.click(canvas.getByRole('button', { name: '바로 시작' }));
    await userEvent.click(canvas.getByRole('button', { name: '이전 화면' }));
    await expect(canvas.getByRole('radio', { name: /팔로워만:/ })).toBeChecked();
    await expect(canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' })).not.toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: '이전 화면' }));
    await expect(canvas.getByText('#책', { exact: true })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '이전 화면' }));
    await expect(canvas.getByRole('textbox', { name: '표시 이름' })).toHaveValue('봄');
    await expect(canvas.getByRole('textbox', { name: '소개' })).toHaveValue('보존할 소개');
  },
};
