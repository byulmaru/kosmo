import { useState } from 'react';
import { Text } from 'react-native';
import { expect, within } from 'storybook/test';
import { ProfileEditImageFields } from '@/components/profile/ProfileEditImageFields';
import { ProfileEditScreen } from '@/components/profile/ProfileEditScreen';
import { ProfileTagEditor } from '@/components/profile/ProfileTagEditor';
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
  startingValue = initialValue,
  disabled = false,
  withImageActions = false,
}: {
  connected?: boolean;
  disabled?: boolean;
  initialValue?: ProfileEditDraft;
  startingValue?: ProfileEditDraft;
  withImageActions?: boolean;
}) {
  const [value, setValue] = useState(startingValue);

  return (
    <ProfileEditScreen
      disabled={disabled}
      initialValue={initialValue}
      onAvatarEdit={withImageActions ? () => undefined : undefined}
      onChange={setValue}
      onHeaderEdit={withImageActions ? () => undefined : undefined}
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

function ProfileEditTagSubmitHarness() {
  const [value, setValue] = useState(initialDraft);
  const [submittedTags, setSubmittedTags] = useState<ReadonlyArray<string>>();

  return (
    <>
      <ProfileEditScreen
        initialValue={initialDraft}
        onChange={setValue}
        onSubmit={(draft) => setSubmittedTags(draft.tags)}
        value={value}
      />
      {submittedTags ? (
        <Text accessibilityLabel="마지막 제출 태그">{submittedTags.join(',')}</Text>
      ) : null}
    </>
  );
}

function ProfileTagEditorHarness({ initialTags = [] }: { initialTags?: ReadonlyArray<string> }) {
  const [tags, setTags] = useState(initialTags);

  return <ProfileTagEditor onChange={setTags} tags={tags} />;
}

function expectMinimumTarget(element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  expect(Math.round(rect.width)).toBeGreaterThanOrEqual(44);
  expect(Math.round(rect.height)).toBeGreaterThanOrEqual(44);
}

function expectResponsiveSurface(
  canvasElement: HTMLElement,
  expectedWidth: number,
  expectedHeaderHeight: number,
) {
  const canvas = within(canvasElement);
  const surface = canvas.getByTestId('profile-edit-screen').getBoundingClientRect();
  const header = canvas.getByTestId('profile-edit-header-preview').getBoundingClientRect();

  expect(Math.round(surface.width)).toBe(expectedWidth);
  expect(Math.round(header.width)).toBe(expectedWidth);
  expect(Math.round(header.height)).toBe(expectedHeaderHeight);
  expect(Math.round(header.width / header.height)).toBe(3);
  expect(canvas.queryByText('팔로우 승인 정책')).not.toBeInTheDocument();
  expect(canvas.queryByText(/현재.*유지/)).not.toBeInTheDocument();
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

export const TagAddDuplicateAndRemove: Story = {
  render: () => <ProfileTagEditorHarness />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: '프로필 태그' });
    const add = canvas.getByRole('button', { name: '태그 추가' });

    await userEvent.type(input, ' #공예 ');
    await userEvent.click(add);
    expect(canvas.getByText('#공예')).toBeVisible();

    await userEvent.type(input, '#공예');
    await userEvent.click(add);
    expect(canvas.getByText('이미 추가한 태그예요.')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '#공예 제거' }));
    expect(canvas.queryByText('#공예')).not.toBeInTheDocument();
  },
};

export const TagReorderMode: Story = {
  render: () => <ProfileTagEditorHarness initialTags={['공예', '개발', '사진']} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '순서 변경' }));
    expect(canvas.getByRole('button', { name: '#공예 위로 이동' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '#공예 아래로 이동' })).toBeEnabled();
    expect(canvas.getByRole('button', { name: '#사진 아래로 이동' })).toBeDisabled();

    expect(canvas.getByRole('button', { name: '순서 변경 완료' })).toHaveFocus();
    await userEvent.tab();
    const moveDown = canvas.getByRole('button', { name: '#공예 아래로 이동' });
    expect(moveDown).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(canvas.getByRole('button', { name: '순서 변경 완료' })).toHaveFocus();
    await userEvent.tab();
    expect(moveDown).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(canvas.getAllByTestId('profile-tag-order-item').map((item) => item.textContent)).toEqual(
      ['#개발', '#공예', '#사진'],
    );

    await userEvent.click(canvas.getByRole('button', { name: '순서 변경 완료' }));
    expect(canvas.getAllByTestId('profile-tag-chip').map((item) => item.textContent)).toEqual([
      '#개발',
      '#공예',
      '#사진',
    ]);
  },
};

export const TagReorderWithSpace: Story = {
  render: () => <ProfileTagEditorHarness initialTags={['공예', '개발']} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '순서 변경' }));
    await userEvent.tab();
    expect(canvas.getByRole('button', { name: '#공예 아래로 이동' })).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(canvas.getAllByTestId('profile-tag-order-item').map((item) => item.textContent)).toEqual(
      ['#개발', '#공예'],
    );
  },
};

export const TagInvalidInput: Story = {
  render: () => <ProfileTagEditorHarness />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole('textbox', { name: '프로필 태그' }), '공예!');
    await userEvent.click(canvas.getByRole('button', { name: '태그 추가' }));
    expect(canvas.getByText('태그는 문자, 숫자, 밑줄만 사용할 수 있어요.')).toBeVisible();
    expect(canvas.queryAllByTestId('profile-tag-chip')).toHaveLength(0);
  },
};

export const TagMaximumState: Story = {
  render: () => <ProfileTagEditorHarness initialTags={['공예', '개발', '사진', '독서', '음악']} />,
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: '프로필 태그' });

    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(canvas.getByRole('button', { name: '태그 추가' })).toBeDisabled();
    expect(canvas.getByText('최대 5개까지 추가할 수 있어요.')).toBeVisible();
  },
};

export const TagChangeUsesOptionalSubmitSeam: Story = {
  render: () => <ProfileEditTagSubmitHarness />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole('textbox', { name: '프로필 태그' }), '#사진');
    await userEvent.click(canvas.getByRole('button', { name: '태그 추가' }));
    await userEvent.click(canvas.getByRole('button', { name: '저장' }));
    expect(canvas.getByLabelText('마지막 제출 태그')).toHaveTextContent('공예,개발,사진');
  },
};

export const ImageReplacementUploading: Story = {
  args: {
    header: {
      kind: 'replacement',
      previewUri: null,
      uploadState: 'uploading',
    },
  },
  play: ({ canvasElement }) => {
    expect(within(canvasElement).getByText('헤더 이미지 업로드를 기다리고 있어요.')).toBeVisible();
  },
};

export const ImageReplacementReadyAndAvatarRemoved: Story = {
  args: {
    avatar: {
      kind: 'removed',
      previewUri: null,
    },
    header: {
      kind: 'replacement',
      previewUri: null,
      uploadState: 'ready',
    },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByText('새 헤더 이미지가 선택됐어요.')).toBeVisible();
    expect(canvas.getByText('아바타 이미지가 제거됩니다.')).toBeVisible();
  },
};

export const UploadingImageBlocksSubmit: Story = {
  render: () => (
    <ProfileEditScreenHarness
      startingValue={{
        ...initialDraft,
        header: {
          kind: 'replacement',
          previewUri: null,
          uploadState: 'uploading',
        },
      }}
      withImageActions
    />
  ),
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByText('헤더 이미지 업로드를 기다리고 있어요.')).toBeVisible();
    expect(canvas.getByRole('button', { name: '저장' })).toBeDisabled();
  },
};

export const SuccessIsAnnounced: Story = {
  render: () => (
    <ProfileEditSubmitStateHarness
      submitState={{ kind: 'success', message: '프로필을 저장했어요.' }}
    />
  ),
  play: ({ canvasElement }) => {
    const status = within(canvasElement).getByText('프로필을 저장했어요.');

    expect(status).toHaveAttribute('aria-live', 'polite');
  },
};

export const DisabledFormBlocksEveryAction: Story = {
  render: () => <ProfileEditScreenHarness disabled withImageActions />,
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('button', { name: '헤더 이미지 변경' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '아바타 이미지 편집' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '#공예 제거' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '순서 변경' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '태그 추가' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '저장' })).toBeDisabled();
    for (const input of canvas.getAllByRole('textbox')) {
      expect(input).toHaveAttribute('readonly');
    }
  },
};

export const ActionTargetsAreAtLeast44: Story = {
  render: () => <ProfileEditScreenHarness withImageActions />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    expectMinimumTarget(canvas.getByRole('button', { name: '헤더 이미지 변경' }));
    expectMinimumTarget(canvas.getByRole('button', { name: '아바타 이미지 편집' }));
    expectMinimumTarget(canvas.getByRole('button', { name: '#공예 제거' }));
    expectMinimumTarget(canvas.getByRole('button', { name: '저장' }));

    await userEvent.click(canvas.getByRole('button', { name: '순서 변경' }));
    expectMinimumTarget(canvas.getByRole('button', { name: '#공예 위로 이동' }));
    expectMinimumTarget(canvas.getByRole('button', { name: '#공예 아래로 이동' }));
  },
};

export const Responsive390: Story = {
  render: () => <ProfileEditScreenHarness />,
  play: ({ canvasElement }) => {
    expectResponsiveSurface(canvasElement, 390, 130);
  },
};

export const Responsive480: Story = {
  parameters: {
    viewport: { defaultViewport: 'kosmoProfileIntermediate' },
  },
  render: () => <ProfileEditScreenHarness />,
  play: ({ canvasElement }) => {
    expectResponsiveSurface(canvasElement, 480, 160);
  },
};

export const Responsive1024: Story = {
  parameters: {
    viewport: { defaultViewport: 'kosmoProfileCompact' },
  },
  render: () => <ProfileEditScreenHarness />,
  play: ({ canvasElement }) => {
    expectResponsiveSurface(canvasElement, 600, 200);
  },
};

export const Responsive1440: Story = {
  parameters: {
    viewport: { defaultViewport: 'kosmoProfileFull' },
  },
  render: () => <ProfileEditScreenHarness />,
  play: ({ canvasElement }) => {
    expectResponsiveSurface(canvasElement, 600, 200);
  },
};

export const LongTextAndFiveLongTags: Story = {
  render: () => (
    <ProfileEditScreenHarness
      initialValue={{
        ...initialDraft,
        bio: '소개'.repeat(250),
        displayName: `${'긴이름'.repeat(13)}긴`,
        tags: ['가'.repeat(20), '나'.repeat(20), '다'.repeat(20), '라'.repeat(20), '마'.repeat(20)],
      }}
    />
  ),
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chips = canvas.getAllByTestId('profile-tag-chip');

    expect(canvas.getByText('40/40')).toBeVisible();
    expect(canvas.getByText('500/500')).toBeVisible();
    expect(chips).toHaveLength(5);
    expect(
      new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size,
    ).toBeGreaterThan(1);
    expect(canvas.getByText('최대 5개까지 추가할 수 있어요.')).toBeVisible();
  },
};
