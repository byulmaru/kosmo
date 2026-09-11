import { useState } from 'react';
import { Text, View } from 'react-native';
import { expect, waitFor, within } from 'storybook/test';
import { ProfileEditDiscardDialog } from '@/components/profile/ProfileEditDiscardDialog';
import { ProfileEditImageFields } from '@/components/profile/ProfileEditImageFields';
import { ProfileEditScreen } from '@/components/profile/ProfileEditScreen';
import { ProfileTagEditor } from '@/components/profile/ProfileTagEditor';
import { colors } from '@/theme/tokens';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
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
  followPolicy: 'OPEN',
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
      onAvatarRemove={withImageActions ? () => undefined : undefined}
      onAvatarRetry={withImageActions ? () => undefined : undefined}
      onBack={() => undefined}
      onChange={setValue}
      onHeaderEdit={withImageActions ? () => undefined : undefined}
      onHeaderRemove={withImageActions ? () => undefined : undefined}
      onHeaderRetry={withImageActions ? () => undefined : undefined}
      onSubmit={connected ? () => undefined : undefined}
      value={value}
    />
  );
}

function ProfileEditSubmitStateHarness({ submitState }: { submitState: ProfileEditSubmitState }) {
  const dirtyDraft: ProfileEditDraft = {
    ...initialDraft,
    bio: '실패 뒤에도 보존할 소개',
    followPolicy: 'APPROVAL_REQUIRED',
  };
  const [value, setValue] = useState(dirtyDraft);
  const [submittedBio, setSubmittedBio] = useState<string | null>(null);
  const [submittedPolicy, setSubmittedPolicy] = useState<string | null>(null);

  return (
    <>
      <ProfileEditScreen
        initialValue={initialDraft}
        onChange={setValue}
        onSubmit={(draft) => {
          setSubmittedBio(draft.bio);
          setSubmittedPolicy(draft.followPolicy);
        }}
        submitState={submitState}
        value={value}
      />
      {submittedBio ? <Text accessibilityLabel="마지막 제출 draft">{submittedBio}</Text> : null}
      {submittedPolicy ? (
        <Text accessibilityLabel="마지막 제출 팔로우 정책">{submittedPolicy}</Text>
      ) : null}
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

function ProfileEditTagSubmitHarness({
  initialValue = initialDraft,
}: {
  initialValue?: ProfileEditDraft;
}) {
  const [value, setValue] = useState(initialValue);
  const [submittedTags, setSubmittedTags] = useState<ReadonlyArray<string>>();
  const [submittedPolicy, setSubmittedPolicy] = useState<string | null>(null);

  return (
    <>
      <ProfileEditScreen
        initialValue={initialValue}
        onChange={setValue}
        onSubmit={(draft) => {
          setSubmittedTags(draft.tags);
          setSubmittedPolicy(draft.followPolicy);
        }}
        value={value}
      />
      <Text accessibilityLabel="현재 팔로우 정책">{value.followPolicy}</Text>
      {submittedTags ? (
        <Text accessibilityLabel="마지막 제출 태그">{submittedTags.join(',')}</Text>
      ) : null}
      {submittedPolicy ? (
        <Text accessibilityLabel="마지막 제출 팔로우 정책">{submittedPolicy}</Text>
      ) : null}
    </>
  );
}

function ProfileTagEditorHarness({ initialTags = [] }: { initialTags?: ReadonlyArray<string> }) {
  const [tags, setTags] = useState(initialTags);

  return <ProfileTagEditor onChange={setTags} tags={tags} />;
}

function ProfileTagWrappingHarness() {
  const maxLengthTag = '가'.repeat(20);

  return (
    <View style={{ width: 180 }} testID="profile-tag-layout-fixture">
      <ProfileTagEditor onChange={() => undefined} tags={['가', '나', maxLengthTag]} />
    </View>
  );
}

function expectResponsiveSurface(
  canvasElement: HTMLElement,
  expectedWidth: number,
  expectedHeaderHeight: number,
  expectedAvatarFrameSize: number,
  expectedAvatarRowHeight: number,
) {
  const canvas = within(canvasElement);
  const surface = canvas.getByTestId('profile-edit-screen').getBoundingClientRect();
  const headerPreview = canvas.getByTestId('profile-edit-header-preview');
  const header = headerPreview.getBoundingClientRect();
  const navigationHeaderElement = canvas.getByTestId('profile-edit-screen-header');
  const navigationHeader = navigationHeaderElement.getBoundingClientRect();
  const title = canvas.getByRole('heading', { name: '프로필 수정' });
  const titleBounds = title.getBoundingClientRect();
  const backButton = canvas.getByRole('button', { name: '프로필 편집 닫기' });
  const backAction = backButton.getBoundingClientRect();
  const saveAction = canvas.getByRole('button', { name: '저장' }).getBoundingClientRect();
  const avatarFrame = canvas.getByTestId('profile-edit-avatar-preview').getBoundingClientRect();
  const avatarContent = canvas
    .getByTestId('profile-edit-avatar-preview-content')
    .getBoundingClientRect();
  const avatarInnerBorder = canvas.getByTestId('profile-edit-avatar-preview-inner-border');
  const avatarRow = canvas.getByTestId('profile-edit-avatar-row').getBoundingClientRect();
  const cameraAffordances = canvas.getAllByTestId('profile-edit-camera-affordance');
  const displayNameLabel = canvas.getByText('표시 이름');
  const displayNameInput = canvas.getByRole('textbox', { name: '표시 이름' });
  const displayNameCounter = canvas.getByText('3/40');
  const bioLabel = canvas.getByText('소개');
  const bioInput = canvas.getByRole('textbox', { name: '소개' });
  const bioCounter = canvas.getByText(`${initialDraft.bio.length}/500`);
  const tagLabel = canvas.getByText('프로필 태그');
  const firstTag = canvas.getAllByTestId('profile-tag-chip')[0]!;
  const tagInput = canvas.getByRole('textbox', { name: '프로필 태그' });
  const tagRemoveButton = canvas.getByRole('button', { name: '#공예 제거' });
  const tagRemoveAction = tagRemoveButton.getBoundingClientRect();
  const tagRemoveLayout = tagRemoveButton.parentElement;

  expect(Math.round(surface.width)).toBe(expectedWidth);
  expect(Math.round(header.width)).toBe(expectedWidth);
  expect(Math.round(header.height)).toBe(expectedHeaderHeight);
  expect(Math.round(header.width / header.height)).toBe(3);
  expect(headerPreview).toHaveStyle({
    borderBottomWidth: 1,
    borderColor: colors.light.borderDefault,
  });
  expect(Math.round(navigationHeader.height)).toBe(64);
  expect(Math.round(titleBounds.left - surface.left)).toBe(80);
  expect(Math.round(surface.right - titleBounds.right)).toBe(80);
  expect(getComputedStyle(title).fontSize).toBe('24px');
  expect(getComputedStyle(title).lineHeight).toBe('27.6px');
  expect(getComputedStyle(title).fontWeight).toBe('700');
  expect(title).toHaveStyle({ color: colors.light.foregroundPrimary });
  expect(navigationHeaderElement).toHaveStyle({
    backgroundColor: colors.light.backgroundCanvas,
    borderColor: colors.light.borderDefault,
    borderBottomWidth: 1,
  });
  expect(Math.round(backAction.width)).toBe(44);
  expect(Math.round(backAction.height)).toBe(44);
  expect(backButton.querySelector('svg')).toHaveAttribute('width', '24');
  expect(backButton.querySelector('svg')).toHaveAttribute('height', '24');
  expect(Math.round(saveAction.width)).toBe(64);
  expect(Math.round(saveAction.height)).toBe(40);
  expect(Math.round(avatarFrame.width)).toBe(expectedAvatarFrameSize);
  expect(Math.round(avatarFrame.height)).toBe(expectedAvatarFrameSize);
  expect(Math.round(avatarContent.width)).toBe(expectedAvatarFrameSize - 8);
  expect(Math.round(avatarContent.height)).toBe(expectedAvatarFrameSize - 8);
  expect(avatarInnerBorder).toHaveStyle({
    borderColor: colors.light.borderDefault,
    borderWidth: 1,
  });
  expect(Math.round(header.bottom - avatarFrame.top)).toBe(expectedAvatarFrameSize / 2);
  expect(Math.round(avatarRow.height)).toBe(expectedAvatarRowHeight);
  expect(cameraAffordances).toHaveLength(2);
  for (const affordance of cameraAffordances) {
    const rect = affordance.getBoundingClientRect();
    const scrim = affordance.firstElementChild;
    expect(Math.round(rect.width)).toBe(40);
    expect(Math.round(rect.height)).toBe(40);
    expect(scrim).not.toBeNull();
    expect(scrim).toHaveStyle({ backgroundColor: colors.light.overlayScrim });
    expect(getComputedStyle(scrim!).opacity).toBe('1');
    expect(affordance.querySelector('svg')).toHaveAttribute('width', '20');
    expect(affordance.querySelector('svg')).toHaveAttribute('height', '20');
  }
  for (const [label, control] of [
    [displayNameLabel, displayNameInput],
    [bioLabel, bioInput],
  ] as const) {
    const labelRect = label.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();
    const labelStyle = getComputedStyle(label);
    expect(Math.round(controlRect.top - labelRect.bottom)).toBe(8);
    expect(labelStyle.fontSize).toBe('16px');
    expect(labelStyle.lineHeight).toBe('24px');
    expect(labelStyle.fontWeight).toBe('600');
  }
  expect(
    Math.round(
      displayNameCounter.getBoundingClientRect().top -
        displayNameInput.getBoundingClientRect().bottom,
    ),
  ).toBe(8);
  expect(
    Math.round(bioCounter.getBoundingClientRect().top - bioInput.getBoundingClientRect().bottom),
  ).toBe(8);
  expect(getComputedStyle(displayNameInput).fontSize).toBe('16px');
  expect(getComputedStyle(displayNameInput).lineHeight).toBe('24px');
  expect(displayNameInput).toHaveStyle({ color: colors.light.foregroundMuted });
  expect(getComputedStyle(bioInput).fontSize).toBe('16px');
  expect(getComputedStyle(bioInput).lineHeight).toBe('24px');
  expect(bioInput).toHaveStyle({ color: colors.light.foregroundMuted });
  expect(getComputedStyle(displayNameCounter).fontSize).toBe('12px');
  expect(getComputedStyle(displayNameCounter).lineHeight).toBe('16px');
  expect(displayNameCounter).toHaveStyle({ color: colors.light.foregroundSecondary });
  expect(getComputedStyle(bioCounter).fontSize).toBe('12px');
  expect(getComputedStyle(bioCounter).lineHeight).toBe('16px');
  expect(bioCounter).toHaveStyle({ color: colors.light.foregroundSecondary });
  expect(
    Math.round(firstTag.getBoundingClientRect().top - tagLabel.getBoundingClientRect().bottom),
  ).toBe(12);
  expect(
    Math.round(tagInput.getBoundingClientRect().top - firstTag.getBoundingClientRect().bottom),
  ).toBe(12);
  expect(firstTag).toHaveStyle({
    backgroundColor: colors.light.backgroundSurface,
    borderColor: colors.light.borderDefault,
    paddingLeft: 8,
  });
  expect(canvas.getByText('#공예')).toHaveStyle({ color: colors.light.foregroundPrimary });
  expect(
    Math.round(
      bioLabel.parentElement!.getBoundingClientRect().top -
        displayNameLabel.parentElement!.getBoundingClientRect().bottom,
    ),
  ).toBe(16);
  expect(Math.round(tagRemoveAction.width)).toBe(32);
  expect(Math.round(tagRemoveAction.height)).toBe(32);
  expect(tagRemoveLayout).not.toBeNull();
  const tagRemoveLayoutRect = tagRemoveLayout?.getBoundingClientRect();
  expect(tagRemoveAction.left).toBeGreaterThanOrEqual(tagRemoveLayoutRect?.left ?? 0);
  expect(tagRemoveAction.right).toBeLessThanOrEqual(tagRemoveLayoutRect?.right ?? 0);
  expect(canvas.queryByText(/현재.*유지/)).not.toBeInTheDocument();
}

const meta = {
  args: {
    avatar: currentAvatar,
    header: currentHeader,
    onAvatarEdit: () => undefined,
    onAvatarRemove: () => undefined,
    onAvatarRetry: () => undefined,
    onHeaderEdit: () => undefined,
    onHeaderRemove: () => undefined,
    onHeaderRetry: () => undefined,
  },
  component: ProfileEditImageFields,
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
  },
  title: 'KOSMO/Screens/Profile Edit/Tests',
} satisfies Meta<typeof ProfileEditImageFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ImageFields: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headerButton = canvas.getByRole('button', { name: '헤더 이미지 변경' });
    const avatarButton = canvas.getByRole('button', { name: '아바타 이미지 편집' });

    expect(headerButton).toBe(canvas.getByTestId('profile-edit-header-preview'));
    expect(headerButton).toHaveStyle({
      backgroundColor: colors.light.actionPrimarySubtle,
      borderColor: colors.light.borderDefault,
    });
    expect(avatarButton).toBe(canvas.getByTestId('profile-edit-avatar-preview'));
    expect(avatarButton).toHaveStyle({
      backgroundColor: colors.light.backgroundSurface,
      borderColor: colors.light.backgroundCanvas,
    });
    expect(canvas.queryByText(/현재.*유지/)).not.toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: '교체' })).not.toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: '제거' })).not.toBeInTheDocument();
  },
};

export const ImageFieldsWithoutCallbacks: Story = {
  args: {
    onAvatarEdit: undefined,
    onAvatarRemove: undefined,
    onAvatarRetry: undefined,
    onHeaderEdit: undefined,
    onHeaderRemove: undefined,
    onHeaderRetry: undefined,
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('button', { name: '헤더 이미지 변경' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '아바타 이미지 편집' })).toBeDisabled();
  },
};

export const CurrentImageMenu: Story = {
  args: {
    avatar: { kind: 'current', previewUri: appleTouchIconUrl },
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: '아바타 이미지 편집' }));
    expect(page.getByRole('menuitem', { name: '이미지 변경' })).toBeVisible();
    expect(page.getByRole('menuitem', { name: '이미지 삭제' })).toBeVisible();
    expect(page.getByRole('menuitem', { name: '취소' })).toBeVisible();
    await userEvent.click(page.getByRole('menuitem', { name: '취소' }));
  },
};

export const HeaderMenuKeepsAvatarOverlap: Story = {
  args: {
    avatar: { kind: 'current', previewUri: appleTouchIconUrl },
    header: { kind: 'current', previewUri: appleTouchIconUrl },
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const headerButton = canvas.getByRole('button', { name: '헤더 이미지 변경' });
    const avatarButton = canvas.getByRole('button', { name: '아바타 이미지 편집' });

    await userEvent.click(headerButton);

    expect(page.getByRole('menuitem', { name: '이미지 변경' })).toBeVisible();
    const avatarRect = avatarButton.getBoundingClientRect();
    const overlapElements = canvasElement.ownerDocument.elementsFromPoint(
      avatarRect.left + avatarRect.width / 2,
      avatarRect.top + 24,
    );
    const avatarStackIndex = overlapElements.findIndex(
      (element) => element === avatarButton || avatarButton.contains(element),
    );
    const headerStackIndex = overlapElements.findIndex(
      (element) => element === headerButton || headerButton.contains(element),
    );
    expect(avatarStackIndex).toBeGreaterThanOrEqual(0);
    expect(headerStackIndex).toBeGreaterThanOrEqual(0);
    expect(avatarStackIndex).toBeLessThan(headerStackIndex);

    await userEvent.click(page.getByRole('menuitem', { name: '취소' }));
  },
};

export const HeaderErrorKeepsCurrentAvatar: Story = {
  args: {
    header: {
      kind: 'replacement',
      previewUri: null,
      uploadState: 'error',
      failure: { stage: 'transfer', reason: 'file-too-large' },
    },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('alert')).toHaveTextContent(
      '헤더 이미지 파일이 너무 커요. 16 MiB 이하의 이미지를 선택해 주세요.',
    );
    expect(canvas.getByRole('button', { name: '헤더 이미지 업로드 다시 시도' })).toBeVisible();
    expect(canvas.getByTestId('profile-edit-avatar-preview')).toBeVisible();
    expect(canvas.getByRole('button', { name: '아바타 이미지 편집' })).toBeEnabled();
    expect(canvas.queryByText(/아바타 이미지 업로드에 실패/)).not.toBeInTheDocument();
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
  },
};

export const DiscardConfirmation: Story = {
  render: () => (
    <ProfileEditDiscardDialog onContinue={() => undefined} onDiscard={() => undefined} visible />
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(page.getByRole('dialog', { name: '변경사항을 버릴까요?' })).toBeVisible(),
    );
    expect(page.getByRole('button', { name: '계속 편집' })).toBeVisible();
    expect(page.getByRole('button', { name: '버리기' })).toBeVisible();
  },
};

export const FollowPolicySwitchSubmitsEnum: Story = {
  render: () => <ProfileEditTagSubmitHarness />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' });

    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(canvas.getByRole('button', { name: '저장' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: '저장' }));
    expect(canvas.getByLabelText('마지막 제출 팔로우 정책')).toHaveTextContent('APPROVAL_REQUIRED');
  },
};

export const FollowPolicyApprovalRequiredInitialState: Story = {
  render: () => (
    <ProfileEditTagSubmitHarness
      initialValue={{ ...initialDraft, followPolicy: 'APPROVAL_REQUIRED' }}
    />
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' });
    const save = canvas.getByRole('button', { name: '저장' });

    expect(canvas.getByLabelText('현재 팔로우 정책')).toHaveTextContent('APPROVAL_REQUIRED');
    expect(toggle).not.toBeChecked();
    expect(save).toBeDisabled();

    await userEvent.click(toggle);
    expect(canvas.getByLabelText('현재 팔로우 정책')).toHaveTextContent('OPEN');
    expect(toggle).toBeChecked();
    expect(save).toBeEnabled();

    await userEvent.click(save);
    expect(canvas.getByLabelText('마지막 제출 팔로우 정책')).toHaveTextContent('OPEN');
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
    expect(canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' })).toBeDisabled();
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
    expect(canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' })).not.toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: '저장' }));
    expect(canvas.getByLabelText('마지막 제출 draft')).toHaveTextContent('실패 뒤에도 보존할 소개');
    expect(canvas.getByLabelText('마지막 제출 팔로우 정책')).toHaveTextContent('APPROVAL_REQUIRED');
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

export const LegacyDisplayNameCanSaveAnotherField: Story = {
  render: () => {
    const initialValue = { ...initialDraft, displayName: '가'.repeat(41) };

    return (
      <ProfileEditScreenHarness
        initialValue={initialValue}
        startingValue={{ ...initialValue, bio: '변경한 소개' }}
      />
    );
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.queryByText('표시 이름은 40자 이하로 입력해 주세요.')).not.toBeInTheDocument();
    expect(canvas.getByRole('button', { name: '저장' })).toBeEnabled();
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
    const label = canvas.getByText('프로필 태그');

    expect(
      Math.round(input.getBoundingClientRect().top - label.getBoundingClientRect().bottom),
    ).toBe(12);

    const inputBounds = input.getBoundingClientRect();
    const addBounds = add.getBoundingClientRect();
    expect(Math.round(inputBounds.height)).toBe(44);
    expect(Math.round(addBounds.height)).toBe(40);
    expect(Math.round(inputBounds.top + inputBounds.height / 2)).toBe(
      Math.round(addBounds.top + addBounds.height / 2),
    );

    await userEvent.type(input, ' #Ｆｏｏ ');
    await userEvent.click(add);
    expect(canvas.getByText('#Foo')).toBeVisible();

    const remove = canvas.getByRole('button', { name: '#Foo 제거' });
    const removeTarget = remove.getBoundingClientRect();
    const removeIcon = remove.querySelector('svg');

    expect(Math.round(removeTarget.width)).toBe(32);
    expect(Math.round(removeTarget.height)).toBe(32);
    expect(removeIcon).not.toBeNull();

    await userEvent.type(input, '#foo');
    await userEvent.click(add);
    expect(canvas.getByText('이미 추가한 태그예요.')).toBeVisible();

    await userEvent.click(remove);
    expect(canvas.queryByText('#Foo')).not.toBeInTheDocument();
  },
};

export const TagRemovalKeyboardParity: Story = {
  render: () => <ProfileTagEditorHarness initialTags={['Foo', 'Bar', 'Baz']} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: '프로필 태그' });

    await userEvent.click(input);
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    const enterAction = canvas.getByRole('button', { name: '#Baz 제거' });
    expect(enterAction).toHaveFocus();
    expect(getComputedStyle(enterAction).outlineStyle).not.toBe('none');
    await userEvent.keyboard('{Enter}');
    expect(canvas.queryByText('#Baz')).not.toBeInTheDocument();

    await userEvent.click(input);
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    const spaceAction = canvas.getByRole('button', { name: '#Bar 제거' });
    expect(spaceAction).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(canvas.queryByText('#Bar')).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: '#Foo 제거' }));
    expect(canvas.queryByText('#Foo')).not.toBeInTheDocument();
  },
};

export const TagAdjacentAndWrappingTargetsDoNotOverlap: Story = {
  render: () => <ProfileTagWrappingHarness />,
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fixture = canvas.getByTestId('profile-tag-layout-fixture');
    const actions = canvas.getAllByRole('button', { name: /제거$/ });
    const [first, second, wrapped] = actions.map((action) => action.getBoundingClientRect());
    const maxLengthTag = '가'.repeat(20);
    const maxLengthText = canvas.getByText(`#${maxLengthTag}`);
    const maxLengthChip = maxLengthText.parentElement!;
    const fixtureBounds = fixture.getBoundingClientRect();
    const maxLengthChipBounds = maxLengthChip.getBoundingClientRect();
    const maxLengthTextStyle = getComputedStyle(maxLengthText);

    expect(actions).toHaveLength(3);
    expect(Math.round(first!.top)).toBe(Math.round(second!.top));
    expect(first!.right).toBeLessThanOrEqual(second!.left);
    expect(wrapped!.top).toBeGreaterThanOrEqual(first!.bottom);
    expect(fixture.scrollWidth).toBeLessThanOrEqual(fixture.clientWidth + 1);
    expect(maxLengthChipBounds.right).toBeLessThanOrEqual(fixtureBounds.right + 1);
    expect(wrapped!.right).toBeLessThanOrEqual(fixtureBounds.right + 1);
    expect(maxLengthChipBounds.height).toBe(32);
    expect(maxLengthTextStyle.whiteSpace).toBe('nowrap');
    expect(maxLengthTextStyle.textOverflow).toBe('ellipsis');
    expect(maxLengthTextStyle.overflow).toBe('hidden');
    expect(maxLengthText.scrollWidth).toBeGreaterThan(maxLengthText.clientWidth);
    expect(canvas.getByLabelText(`#${maxLengthTag}`)).toBe(maxLengthText);
    for (const target of [first!, second!, wrapped!]) {
      expect(Math.round(target.width)).toBe(32);
      expect(Math.round(target.height)).toBe(32);
    }
  },
};

export const TagInvalidInput: Story = {
  render: () => <ProfileTagEditorHarness />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole('textbox', { name: '프로필 태그' }), '공예!');
    await userEvent.click(canvas.getByRole('button', { name: '태그 추가' }));
    expect(
      canvas.getByText('Profile Tag는 1~20자의 문자, 숫자 또는 밑줄만 사용할 수 있어요.'),
    ).toBeVisible();
    expect(canvas.queryAllByTestId('profile-tag-chip')).toHaveLength(0);
  },
};

export const TagWithoutLimitOrReorder: Story = {
  render: () => <ProfileTagEditorHarness initialTags={['공예', '개발', '사진', '독서', '음악']} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: '프로필 태그' });
    const add = canvas.getByRole('button', { name: '태그 추가' });

    expect(canvas.queryByRole('button', { name: '순서 변경' })).not.toBeInTheDocument();
    expect(input).toBeEnabled();
    expect(add).toBeEnabled();
    await userEvent.type(input, '여섯');
    await userEvent.click(add);
    expect(canvas.getAllByTestId('profile-tag-chip')).toHaveLength(6);
    expect(canvas.getByText('#여섯')).toBeVisible();
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

export const DisabledFormBlocksEveryAction: Story = {
  render: () => <ProfileEditScreenHarness disabled withImageActions />,
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('button', { name: '헤더 이미지 변경' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '아바타 이미지 편집' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '#공예 제거' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '태그 추가' })).toBeDisabled();
    expect(canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '저장' })).toBeDisabled();
    for (const input of canvas.getAllByRole('textbox')) {
      expect(input).toHaveAttribute('readonly');
    }
    expect(canvas.getByRole('textbox', { name: '표시 이름' })).toHaveStyle({
      color: colors.light.stateDisabledForeground,
    });
    expect(canvas.getByRole('textbox', { name: '소개' })).toHaveStyle({
      color: colors.light.stateDisabledForeground,
    });
  },
};

export const Responsive390: Story = {
  render: () => <ProfileEditScreenHarness withImageActions />,
  play: ({ canvasElement }) => {
    expectResponsiveSurface(canvasElement, 390, 130, 96, 64);
  },
};

export const Responsive1024: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
  render: () => <ProfileEditScreenHarness withImageActions />,
  play: ({ canvasElement }) => {
    expectResponsiveSurface(canvasElement, 600, 200, 128, 80);
  },
};

export const Responsive1440: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
  render: () => <ProfileEditScreenHarness withImageActions />,
  play: ({ canvasElement }) => {
    expectResponsiveSurface(canvasElement, 600, 200, 128, 80);
  },
};

export const LongTextAndLongTags: Story = {
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
    expect(canvas.getByRole('textbox', { name: '프로필 태그' })).toBeEnabled();
  },
};

export const BioCounterMatchesServerUtf16Boundary: Story = {
  render: () => (
    <ProfileEditScreenHarness
      initialValue={{
        ...initialDraft,
        bio: `  ${'😀'.repeat(250)}  `,
      }}
    />
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const bio = canvas.getByRole('textbox', { name: '소개' });

    expect(canvas.getByText('500/500')).toBeVisible();
    expect(canvas.queryByText('한 줄 소개는 500자 이하로 입력해 주세요.')).not.toBeInTheDocument();

    await userEvent.clear(bio);
    await userEvent.type(bio, '😀'.repeat(251));

    expect(canvas.getByText('502/500')).toBeVisible();
    expect(canvas.getByText('한 줄 소개는 500자 이하로 입력해 주세요.')).toBeVisible();
    expect(canvas.getByRole('button', { name: '저장' })).toBeDisabled();
  },
};
