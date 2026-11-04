import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SettingsRouteLayout } from '@/app/(tabs)/(protected)/settings/_layout';
import SettingsNaturalLanguageMuteRoute from '@/app/(tabs)/(protected)/settings/natural-language-mute';
import { profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RequestParameters, Variables } from 'relay-runtime';

const selectedProfile = profile({
  displayName: '현재 Profile',
  handle: 'settings-member',
  id: 'settings-natural-language-member',
  instance: { canonicalOrigin: 'https://selected-profile.example', kind: 'LOCAL' },
  relativeHandle: '@settings-member',
  viewerState: {
    follow: null,
    followRequest: null,
    isSelf: true,
    membership: { role: 'MEMBER' },
  },
});

type StoryRule = { __typename: 'NaturalLanguageMuteRule'; condition: string; id: string };

function profileData(rules: StoryRule[] | null = []) {
  return {
    currentSession: {
      id: 'settings-natural-language-session',
      selectedProfile: { ...selectedProfile, naturalLanguageMuteRules: rules },
    },
  };
}

const initialRule: StoryRule = {
  __typename: 'NaturalLanguageMuteRule',
  condition:
    'Avoid posts that reveal character deaths, major plot twists, or endings from the books, films, games, and series I am following until I mark them as finished.',
  id: 'natural-language-mute-rule',
};
const mutationResponses = {
  createNaturalLanguageMuteRule: {
    profile: { ...selectedProfile, naturalLanguageMuteRules: [] as StoryRule[] },
  },
  updateNaturalLanguageMuteRule: {
    profile: { ...selectedProfile, naturalLanguageMuteRules: [initialRule] },
  },
  deleteNaturalLanguageMuteRule: {
    naturalLanguageMuteRuleId: initialRule.id,
    profile: { ...selectedProfile, naturalLanguageMuteRules: [] as StoryRule[] },
  },
};

function resetMutationResponses() {
  mutationResponses.createNaturalLanguageMuteRule.profile.naturalLanguageMuteRules = [];
  mutationResponses.updateNaturalLanguageMuteRule.profile.naturalLanguageMuteRules = [initialRule];
  mutationResponses.deleteNaturalLanguageMuteRule.profile.naturalLanguageMuteRules = [];
}

function observeMutation(request: RequestParameters, variables: Variables) {
  const input = variables.input as { condition?: string };
  const nextRule = { ...initialRule, condition: input.condition ?? initialRule.condition };
  if (request.name === 'SettingsNaturalLanguageMuteCreateMutation') {
    mutationResponses.createNaturalLanguageMuteRule.profile.naturalLanguageMuteRules = [nextRule];
  } else if (request.name === 'SettingsNaturalLanguageMuteUpdateMutation') {
    mutationResponses.updateNaturalLanguageMuteRule.profile.naturalLanguageMuteRules = [nextRule];
  }
}

function StoryCanvas() {
  return (
    <SettingsRouteLayout>
      <SettingsNaturalLanguageMuteRoute />
    </SettingsRouteLayout>
  );
}

const meta = {
  component: StoryCanvas,
  parameters: {
    layout: 'fullscreen',
    relay: {
      data: profileData(),
      mutationRequestObserver: observeMutation,
      mutationResponse: mutationResponses,
    },
    router: { pathname: '/settings/natural-language-mute' },
  },
  render: () => <StoryCanvas />,
  title: 'KOSMO/Screens/Natural Language Mute',
} satisfies Meta<typeof StoryCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  beforeEach: resetMutationResponses,
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: '자연어 뮤트' })).toBeVisible();
    expect(canvas.getByRole('textbox', { name: '제외 조건' })).toHaveValue('');
    expect(canvas.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(canvas.queryByRole('button', { name: '삭제' })).toBeNull();
  },
};

export const ExistingRule: Story = {
  beforeEach: resetMutationResponses,
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { relay: { data: profileData([initialRule]) } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('textbox', { name: '제외 조건' })).toHaveValue(initialRule.condition);
    expect(canvas.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '삭제' })).toBeEnabled();
  },
};

export const Loading: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    relay: {
      data: profileData(),
      operationResponses: {
        SettingsNaturalLanguageMuteQuery: { data: profileData(), delayMs: 60_000 },
      },
    },
  },
  play: ({ canvasElement }) => {
    expect(
      within(canvasElement).getByRole('progressbar', { name: '제외 조건을 불러오는 중입니다.' }),
    ).toBeVisible();
  },
};

export const QueryErrorRetry: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    relay: {
      data: profileData(),
      operationResponses: {
        SettingsNaturalLanguageMuteQuery: {
          sequence: [
            {
              data: profileData(null),
              errors: [
                {
                  message: 'Natural language mute rules are unavailable',
                  path: ['currentSession', 'selectedProfile', 'naturalLanguageMuteRules'],
                },
              ],
            },
            { data: profileData() },
          ],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '제외 조건을 불러오지 못했어요',
    );
    expect(canvas.queryByRole('textbox', { name: '제외 조건' })).toBeNull();
    expect(canvas.queryByRole('button', { name: '저장' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findByRole('textbox', { name: '제외 조건' })).resolves.toBeVisible();
  },
};

export const CreateUpdateDelete: Story = {
  beforeEach: resetMutationResponses,
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole('textbox', { name: '제외 조건' });
    await userEvent.type(field, 'Avoid posts with a leaked ending.');
    await userEvent.click(canvas.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(canvas.getByRole('button', { name: '삭제' })).toBeEnabled());

    await userEvent.clear(field);
    await userEvent.type(field, 'Avoid posts with a leaked ending or spoiler image.');
    await userEvent.click(canvas.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(canvas.getByRole('button', { name: '삭제' })).toBeEnabled());

    await userEvent.click(canvas.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(field).toHaveValue(''));
    expect(canvas.queryByRole('button', { name: '삭제' })).toBeNull();
  },
};
