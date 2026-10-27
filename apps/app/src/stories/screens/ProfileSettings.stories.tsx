import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useArgs } from 'storybook/preview-api';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import { ProfilePostingSettings } from '@/components/settings/ProfilePostingSettings';
import { ProfileSettingsScreen } from '@/components/settings/ProfileSettingsScreen';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfilePostingSettingsValue } from '@/components/settings/ProfilePostingSettings';

type Phase = 'entry' | 'idle' | 'pending' | 'error';
type Outcome = 'error' | 'pending';

type Args = {
  deletionEnabled: boolean;
  embedded?: boolean;
  onSettingsChange: (value: ProfilePostingSettingsValue) => void;
  phase: Phase;
  displayName: string;
  relativeHandle: string;
  outcome: Outcome;
  onStart: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onPhaseChange?: (phase: Phase) => void;
};

function ProfileSettingsExample({ onPhaseChange, ...args }: Args) {
  const { height } = useWindowDimensions();
  const [postingSettings, setPostingSettings] = useState<ProfilePostingSettingsValue>({
    defaultPostVisibility: 'PUBLIC',
    followPolicy: 'APPROVAL_REQUIRED',
  });
  const [localPhase, setLocalPhase] = useState<Phase>(args.phase);
  const phase = onPhaseChange ? args.phase : localPhase;
  const updatePhase = (nextPhase: Phase) => {
    if (!onPhaseChange) {
      setLocalPhase(nextPhase);
    }
    onPhaseChange?.(nextPhase);
  };
  const request = async () => {
    updatePhase('pending');
    args.onConfirm();
    if (args.outcome === 'pending') {
      return;
    }
    // Simulates only the caller's request result; no API, authentication or navigation runs here.
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    updatePhase('error');
  };
  return (
    <View style={{ alignSelf: 'center', maxWidth: 640, minHeight: height, width: '100%' }}>
      <ProfileSettingsScreen
        embedded={args.embedded}
        profile={{
          id: 'profile-settings-story',
          displayName: args.displayName,
          relativeHandle: args.relativeHandle,
        }}
        deletion={
          args.deletionEnabled
            ? {
                phase,
                onStart: () => {
                  args.onStart();
                  updatePhase('idle');
                },
                onCancel: () => {
                  args.onCancel();
                  updatePhase('entry');
                },
                onConfirm: () => void request(),
              }
            : undefined
        }
      >
        <ProfilePostingSettings
          value={postingSettings}
          onChange={(value) => {
            args.onSettingsChange(value);
            setPostingSettings(value);
          }}
        />
      </ProfileSettingsScreen>
    </View>
  );
}

const meta = {
  args: {
    deletionEnabled: true,
    embedded: false,
    onSettingsChange: fn(),
    phase: 'entry',
    displayName: '코스모 작가',
    relativeHandle: '@selected',
    outcome: 'error',
    onStart: fn(),
    onCancel: fn(),
    onConfirm: fn(),
  },
  argTypes: {
    deletionEnabled: { control: 'boolean' },
    embedded: { control: 'boolean' },
    phase: { control: 'select', options: ['entry', 'idle', 'pending', 'error'] },
    outcome: { control: 'inline-radio', options: ['error', 'pending'] },
    onPhaseChange: { control: false },
  },
  component: ProfileSettingsExample,
  excludeStories: ['SettingsContract', 'DeleteFlowContract', 'PendingContract'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
  render: (args) => (
    <ProfileSettingsExample
      key={[args.phase, args.outcome, args.deletionEnabled, args.embedded].join(':')}
      {...args}
    />
  ),
  title: 'KOSMO/Screens/Profile Settings',
} satisfies Meta<typeof ProfileSettingsExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs<Args>();
    return (
      <ProfileSettingsExample
        key={[args.outcome, args.deletionEnabled, args.embedded].join(':')}
        {...args}
        onPhaseChange={(phase) => updateArgs({ phase })}
      />
    );
  },
  parameters: {
    controls: {
      disable: false,
      include: ['deletionEnabled', 'phase', 'displayName', 'relativeHandle'],
    },
  },
};
export const DeleteConfirmation: Story = {
  args: { phase: 'idle' },
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
};
export const EmbeddedDelete: Story = {
  args: { embedded: true },
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
};
export const Pending: Story = { args: { phase: 'pending', outcome: 'pending' } };
export const Error: Story = { args: { phase: 'error', outcome: 'pending' } };
export const LongContent: Story = {
  args: {
    embedded: true,
    phase: 'idle',
    displayName: '아주 긴 이름을 가진 코스모의 작가와 함께 읽고 쓰는 이야기',
    relativeHandle: '@a-long-profile-handle@a-very-long-instance.example',
  },
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
};

export const SettingsContract: Story = {
  args: { deletionEnabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: '게시물 기본 공개 범위' })).toHaveValue(
      'PUBLIC',
    );
    await expect(canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' })).not.toBeChecked();
    await expect(canvas.queryByRole('button', { name: '프로필 삭제' })).not.toBeInTheDocument();
  },
};

export const DeleteFlowContract: Story = {
  args: { embedded: true, phase: 'entry', outcome: 'error' },
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const visibility = canvas.getByRole('combobox', { name: '게시물 기본 공개 범위' });
    const followApproval = canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' });
    await userEvent.selectOptions(visibility, 'FOLLOWERS');
    await userEvent.click(followApproval);
    await expect(visibility).toHaveValue('FOLLOWERS');
    await expect(followApproval).toBeChecked();

    await userEvent.click(canvas.getByRole('button', { name: '프로필 삭제' }));
    const heading = canvas.getByRole('heading', { name: '프로필을 삭제할까요?' });
    await waitFor(() => expect(heading.closest('[tabindex="-1"]')).toHaveFocus());
    await expect(args.onStart).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole('button', { name: '취소' }));
    await expect(canvas.getByRole('combobox', { name: '게시물 기본 공개 범위' })).toHaveValue(
      'FOLLOWERS',
    );
    await expect(canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' })).toBeChecked();
    await expect(args.onSettingsChange).toHaveBeenLastCalledWith({
      defaultPostVisibility: 'FOLLOWERS',
      followPolicy: 'OPEN',
    });
    await waitFor(() => expect(canvas.getByRole('button', { name: '프로필 삭제' })).toHaveFocus());
    await expect(args.onCancel).toHaveBeenCalledTimes(1);

    await userEvent.click(canvas.getByRole('button', { name: '프로필 삭제' }));
    const checkbox = canvas.getByRole('checkbox', {
      name: '프로필을 복구할 수 없음을 확인했습니다.',
    });
    const confirm = canvas.getByRole('button', { name: '프로필 삭제' });
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(confirm);
    await expect(args.onConfirm).not.toHaveBeenCalled();
    checkbox.focus();
    await userEvent.keyboard(' ');
    await expect(checkbox).toBeChecked();

    await userEvent.click(confirm);
    const pendingButton = canvas.getByRole('button', { name: '프로필 삭제' });
    await waitFor(() => expect(pendingButton).toHaveAttribute('aria-busy', 'true'));
    await expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.getByRole('button', { name: '취소' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await fireEvent.click(canvas.getByRole('button', { name: '취소' }));
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByRole('combobox')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(canvas.getByRole('alert')).toHaveTextContent(
        '프로필을 삭제하지 못했어요. 다시 시도해주세요.',
      ),
    );
    await expect(checkbox).toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(args.onConfirm).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(canvas.getByRole('alert')).toHaveTextContent(
        '프로필을 삭제하지 못했어요. 다시 시도해주세요.',
      ),
    );
  },
};

export const PendingContract: Story = {
  args: { embedded: true, phase: 'pending', outcome: 'pending' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole('checkbox', {
      name: '프로필을 복구할 수 없음을 확인했습니다.',
    });
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    const cancel = canvas.getByRole('button', { name: '취소' });
    const confirm = canvas.getByRole('button', { name: '프로필 삭제' });
    await expect(cancel).toHaveAttribute('aria-disabled', 'true');
    await expect(confirm).toHaveAttribute('aria-busy', 'true');
    await fireEvent.click(cancel);
    await fireEvent.click(confirm);
    await expect(args.onCancel).not.toHaveBeenCalled();
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};
