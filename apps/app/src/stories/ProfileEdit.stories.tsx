import { useState } from 'react';
import { Text } from 'react-native';
import { expect, within } from 'storybook/test';
import { ProfileEditImageFields } from '@/components/profile/ProfileEditImageFields';
import { ProfileEditScreen } from '@/components/profile/ProfileEditScreen';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  ProfileEditDraft,
  ProfileEditFieldErrors,
  ProfileEditImageDraft,
  ProfileEditSubmitState,
} from '@/components/profile/profileEditState';

const currentAvatar: ProfileEditImageDraft = {
  kind: 'current',
  previewUri: null,
};

const currentHeader: ProfileEditImageDraft = {
  kind: 'current',
  previewUri: null,
};

const initialDraft: ProfileEditDraft = {
  avatar: currentAvatar,
  bio: '창작과 개발을 좋아합니다.',
  displayName: '코스모',
  header: currentHeader,
  tags: ['공예', '개발'],
};

function ProfileEditScreenHarness({
  connected = true,
  initialValue = initialDraft,
}: {
  connected?: boolean;
  initialValue?: ProfileEditDraft;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <ProfileEditScreen
      initialValue={initialValue}
      onChange={setValue}
      onSubmit={connected ? () => undefined : undefined}
      value={value}
    />
  );
}

function ProfileEditSubmitStateHarness({ submitState }: { submitState: ProfileEditSubmitState }) {
  const dirtyDraft = { ...initialDraft, bio: '실패 뒤에도 보존할 소개' };
  const [value, setValue] = useState(dirtyDraft);
  const [submittedBio, setSubmittedBio] = useState<string | null>(null);

  return (
    <>
      <ProfileEditScreen
        initialValue={initialDraft}
        onChange={setValue}
        onSubmit={(draft) => setSubmittedBio(draft.bio)}
        submitState={submitState}
        value={value}
      />
      {submittedBio ? <Text accessibilityLabel="마지막 제출 draft">{submittedBio}</Text> : null}
    </>
  );
}

function ProfileEditServerErrorHarness() {
  const [value, setValue] = useState({ ...initialDraft, displayName: '중복 이름' });
  const [serverErrors, setServerErrors] = useState<ProfileEditFieldErrors>({
    displayName: '이미 사용 중인 이름입니다.',
  });

  return (
    <ProfileEditScreen
      initialValue={initialDraft}
      onChange={(next) => {
        if (next.displayName !== value.displayName) {
          setServerErrors({});
        }
        setValue(next);
      }}
      onSubmit={() => undefined}
      serverErrors={serverErrors}
      value={value}
    />
  );
}

const meta = {
  args: {
    avatar: currentAvatar,
    header: currentHeader,
    onAvatarEdit: () => undefined,
    onHeaderEdit: () => undefined,
  },
  component: ProfileEditImageFields,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'kosmoMobile' },
  },
  title: 'KOSMO/Profiles/Profile Edit',
} satisfies Meta<typeof ProfileEditImageFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ImageFields: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('button', { name: '헤더 이미지 변경' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '아바타 이미지 편집' })).toBeVisible();
    expect(canvas.queryByText(/현재.*유지/)).not.toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: '교체' })).not.toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: '제거' })).not.toBeInTheDocument();

    const preview = canvas.getByTestId('profile-edit-header-preview');
    const rect = preview.getBoundingClientRect();
    expect(Math.round(rect.width)).toBe(390);
    expect(Math.round(rect.height)).toBe(130);
  },
};

export const ImageFieldsWithoutCallbacks: Story = {
  args: {
    onAvatarEdit: undefined,
    onHeaderEdit: undefined,
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('button', { name: '헤더 이미지 변경' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '아바타 이미지 편집' })).toBeDisabled();
  },
};

export const ImageFieldsWide: Story = {
  parameters: {
    viewport: { defaultViewport: 'kosmoPickerWide' },
  },
  play: ({ canvasElement }) => {
    const preview = within(canvasElement).getByTestId('profile-edit-header-preview');
    const rect = preview.getBoundingClientRect();

    expect(Math.round(rect.width)).toBe(600);
    expect(Math.round(rect.height)).toBe(200);
  },
};

export const HeaderErrorKeepsCurrentAvatar: Story = {
  args: {
    header: {
      error: '헤더 이미지를 준비하지 못했어요.',
      kind: 'replacement',
      previewUri: null,
      uploadState: 'error',
    },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('alert')).toHaveTextContent('헤더 이미지를 준비하지 못했어요.');
    expect(canvas.getByTestId('profile-edit-avatar-preview')).toBeVisible();
    expect(canvas.getByRole('button', { name: '아바타 이미지 편집' })).toBeEnabled();
    expect(canvas.queryByText(/아바타.*준비하지 못했어요/)).not.toBeInTheDocument();
  },
};

export const TextFieldsAndSubmitGate: Story = {
  render: () => <ProfileEditScreenHarness />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const displayName = canvas.getByRole('textbox', { name: '표시 이름' });
    const save = canvas.getByRole('button', { name: '저장' });

    expect(save).toBeDisabled();
    await userEvent.clear(displayName);
    expect(canvas.getByText('표시 이름을 입력해 주세요.')).toBeVisible();
    await userEvent.type(displayName, '새 이름');
    expect(save).toBeEnabled();
    expect(canvas.queryByText('팔로우 승인 정책')).not.toBeInTheDocument();
  },
};

export const DisconnectedSubmitStaysDisabled: Story = {
  render: () => <ProfileEditScreenHarness connected={false} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole('textbox', { name: '소개' }), ' 변경');
    expect(canvas.getByRole('button', { name: '저장' })).toBeDisabled();
  },
};

export const SavingKeepsDraftAndDisablesSubmit: Story = {
  render: () => <ProfileEditSubmitStateHarness submitState={{ kind: 'saving' }} />,
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('textbox', { name: '소개' })).toHaveValue('실패 뒤에도 보존할 소개');
    expect(canvas.getByRole('button', { name: '저장' })).toBeDisabled();
  },
};

export const FailureKeepsDraftAndRetriesIt: Story = {
  render: () => (
    <ProfileEditSubmitStateHarness
      submitState={{ kind: 'error', message: '프로필을 저장하지 못했어요.' }}
    />
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('alert')).toHaveTextContent('프로필을 저장하지 못했어요.');
    expect(canvas.getByRole('textbox', { name: '소개' })).toHaveValue('실패 뒤에도 보존할 소개');
    await userEvent.click(canvas.getByRole('button', { name: '저장' }));
    expect(canvas.getByLabelText('마지막 제출 draft')).toHaveTextContent('실패 뒤에도 보존할 소개');
  },
};

export const AstralDisplayNameUsesCodePointLimit: Story = {
  render: () => (
    <ProfileEditScreenHarness initialValue={{ ...initialDraft, displayName: '😀'.repeat(40) }} />
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const displayName = canvas.getByRole('textbox', { name: '표시 이름' });

    expect(displayName).toHaveValue('😀'.repeat(40));
    expect(canvas.getByText('40/40')).toBeVisible();
    await userEvent.type(displayName, '😀');
    expect(displayName).toHaveValue('😀'.repeat(41));
    expect(canvas.getByText('41/40')).toBeVisible();
    expect(canvas.getByText('표시 이름은 40자 이하로 입력해 주세요.')).toBeVisible();
  },
};

export const ServerFieldErrorClearsAfterEditing: Story = {
  render: () => <ProfileEditServerErrorHarness />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const displayName = canvas.getByRole('textbox', { name: '표시 이름' });
    const save = canvas.getByRole('button', { name: '저장' });

    expect(canvas.getByText('이미 사용 중인 이름입니다.')).toBeVisible();
    expect(save).toBeDisabled();
    await userEvent.clear(displayName);
    await userEvent.type(displayName, '새 이름');
    expect(canvas.queryByText('이미 사용 중인 이름입니다.')).not.toBeInTheDocument();
    expect(save).toBeEnabled();
  },
};
