import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ProfilePostingSettings } from '@/components/settings/ProfilePostingSettings';
import { ProfileSettingsScreen } from '@/components/settings/ProfileSettingsScreen';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfilePostingSettingsValue } from '@/components/settings/ProfilePostingSettings';
import type {
  ProfileLifecycleAction,
  ProfileLifecycleState,
} from '@/components/settings/ProfileSettingsScreen';

type Args = {
  lifecycleEnabled: boolean;
  onSettingsChange: (value: ProfilePostingSettingsValue) => void;
  action: ProfileLifecycleAction;
  state: ProfileLifecycleState['phase'];
  displayName: string;
  relativeHandle: string;
  outcome: 'success' | 'error' | 'pending';
  onAction: (action: ProfileLifecycleAction) => void;
  onCancel: () => void;
  onConfirm: (action: ProfileLifecycleAction) => void;
  onRetry: (action: ProfileLifecycleAction) => void;
};

function ProfileSettingsExample(args: Args) {
  const { height } = useWindowDimensions();
  const [postingSettings, setPostingSettings] = useState<ProfilePostingSettingsValue>({
    defaultPostVisibility: 'PUBLIC',
    followPolicy: 'APPROVAL_REQUIRED',
  });
  const [state, setState] = useState<ProfileLifecycleState>({
    action: args.action,
    phase: args.state,
  });
  const request = async (action: ProfileLifecycleAction, retry: boolean) => {
    setState({ action, phase: 'pending' });
    (retry ? args.onRetry : args.onConfirm)(action);
    if (args.outcome === 'pending') {
      return;
    }
    // Simulates only a caller's request result; no API, authentication or navigation runs here.
    await new Promise((resolve) => setTimeout(resolve, 400));
    setState({ action, phase: args.outcome });
  };
  return (
    <View style={{ alignSelf: 'center', maxWidth: 640, minHeight: height, width: '100%' }}>
      <ProfileSettingsScreen
        profile={{
          id: 'lifecycle-profile',
          displayName: args.displayName,
          relativeHandle: args.relativeHandle,
        }}
        lifecycle={
          args.lifecycleEnabled
            ? {
                state,
                onAction: (action) => {
                  args.onAction(action);
                  setState({ action, phase: 'idle' });
                },
                onCancel: () => {
                  args.onCancel();
                  setState({ action: state.action, phase: 'entry' });
                },
                onConfirm: (action) => void request(action, false),
                onRetry: (action) => void request(action, true),
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
    lifecycleEnabled: true,
    onSettingsChange: fn(),
    action: 'deactivate',
    state: 'entry',
    displayName: '코스모 작가',
    relativeHandle: '@selected',
    outcome: 'success',
    onAction: fn(),
    onCancel: fn(),
    onConfirm: fn(),
    onRetry: fn(),
  },
  argTypes: {
    lifecycleEnabled: { control: 'boolean' },
    action: {
      if: { arg: 'lifecycleEnabled' },
      control: 'inline-radio',
      options: ['deactivate', 'reactivate', 'delete'],
    },
    state: {
      if: { arg: 'lifecycleEnabled' },
      control: 'select',
      options: ['entry', 'idle', 'pending', 'error', 'success'],
    },
    outcome: {
      if: { arg: 'lifecycleEnabled' },
      control: 'inline-radio',
      options: ['success', 'error', 'pending'],
    },
  },
  component: ProfileSettingsExample,
  excludeStories: [
    'SettingsContract',
    'DeactivateContract',
    'DeactivateErrorContract',
    'ReactivateContract',
    'DeleteRetryContract',
    'DeleteSuccessContract',
    'DeleteErrorContract',
    'PendingContract',
  ],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
  render: (args) => (
    <ProfileSettingsExample
      key={`${args.action}:${args.state}:${args.outcome}:${args.lifecycleEnabled}`}
      {...args}
    />
  ),
  title: 'KOSMO/Screens/Profile Settings',
} satisfies Meta<typeof ProfileSettingsExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { lifecycleEnabled: false },
  parameters: {
    controls: {
      disable: false,
      include: ['lifecycleEnabled', 'action', 'state', 'outcome', 'displayName', 'relativeHandle'],
    },
  },
};
export const WithLifecycle: Story = {
  parameters: Playground.parameters,
};
export const DeactivateConfirmation: Story = {
  args: { state: 'idle' },
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
};
export const ReactivateConfirmation: Story = {
  args: { action: 'reactivate', state: 'idle' },
  globals: { viewport: { value: 'kosmoCompact', isRotated: false } },
};
export const DeleteConfirmation: Story = {
  args: { action: 'delete', state: 'idle' },
  globals: { viewport: { value: 'kosmoFull', isRotated: false } },
};
export const Pending: Story = { args: { action: 'delete', state: 'pending' } };
export const Error: Story = { args: { action: 'delete', state: 'error' } };
export const Deleted: Story = { args: { action: 'delete', state: 'success' } };
export const LongContent: Story = {
  args: {
    action: 'delete',
    state: 'idle',
    displayName: '아주 긴 이름을 가진 코스모의 작가와 함께 읽고 쓰는 이야기',
    relativeHandle: '@a-long-profile-handle@a-very-long-instance.example',
  },
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
};

export const SettingsContract: Story = {
  args: { lifecycleEnabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: '게시물 기본 공개 범위' })).toHaveValue(
      'PUBLIC',
    );
    await expect(canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' })).not.toBeChecked();
    await expect(canvas.queryByRole('button', { name: /프로필 비활성화/ })).not.toBeInTheDocument();
  },
};

export const DeactivateContract: Story = {
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: /프로필 비활성화/ });
    await userEvent.selectOptions(
      canvas.getByRole('combobox', { name: '게시물 기본 공개 범위' }),
      'FOLLOWERS',
    );
    await userEvent.click(canvas.getByRole('switch', { name: '팔로우 요청 자동 승인' }));
    await userEvent.click(trigger);
    await waitFor(() =>
      expect(
        canvas.getByRole('heading', { name: '비활성화' }).closest('[tabindex="-1"]'),
      ).toHaveFocus(),
    );
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(page.queryByRole('alertdialog')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: '취소하고 프로필 설정으로 돌아가기' }),
    );
    await expect(canvas.getByRole('combobox')).toHaveValue('FOLLOWERS');
    await expect(canvas.getByRole('switch')).toBeChecked();
    await expect(args.onSettingsChange).toHaveBeenLastCalledWith({
      defaultPostVisibility: 'FOLLOWERS',
      followPolicy: 'OPEN',
    });
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: /프로필 비활성화/ })).toHaveFocus(),
    );
    await userEvent.click(canvas.getByRole('button', { name: /프로필 비활성화/ }));
    const confirm = canvas.getByRole('button', { name: '비활성화' });
    const checkbox = canvas.getByRole('checkbox', { name: '위 영향을 모두 확인했습니다.' });
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    confirm.click();
    await expect(args.onConfirm).not.toHaveBeenCalled();
    checkbox.focus();
    await userEvent.keyboard(' ');
    await expect(checkbox).toBeChecked();
    await userEvent.click(confirm);
    await expect(confirm).toHaveAttribute('aria-busy', 'true');
    await expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    const back = canvas.getByRole('button', { name: '취소하고 프로필 설정으로 돌아가기' });
    await expect(back).toHaveAttribute('aria-disabled', 'true');
    back.click();
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(confirm).toBeVisible();
    await expect(canvas.queryByRole('combobox')).not.toBeInTheDocument();
    confirm.click();
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).toHaveBeenCalledWith('deactivate');
    await waitFor(() => expect(canvas.getByText('이 프로필은 비활성 상태예요')).toBeVisible());
    await expect(canvas.getByRole('button', { name: '다시 활성화' })).toBeVisible();
    await waitFor(() =>
      expect(page.getByRole('alert')).toHaveTextContent('프로필을 비활성화했어요.'),
    );
    await expect(args.onAction).toHaveBeenCalledTimes(2);
    await expect(args.onAction).toHaveBeenCalledWith('deactivate');
  },
};

export const DeactivateErrorContract: Story = {
  args: { outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: /프로필 비활성화/ }));
    const checkbox = canvas.getByRole('checkbox', { name: '위 영향을 모두 확인했습니다.' });
    const confirm = canvas.getByRole('button', { name: '비활성화' });
    await userEvent.click(checkbox);
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(page.getByText('프로필을 비활성화하지 못했어요. 다시 시도해주세요.')).toBeVisible(),
    );
    await expect(checkbox).toBeChecked();
    await expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(confirm);
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
    await expect(args.onRetry).toHaveBeenCalledWith('deactivate');
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await expect(confirm).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-busy', 'true'));
    await expect(checkbox).toBeChecked();
  },
};

export const ReactivateContract: Story = {
  args: { action: 'reactivate' },
  globals: { viewport: { value: 'kosmoCompact', isRotated: false } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '다시 활성화' });
    await userEvent.click(trigger);
    const dialog = await page.findByRole('dialog', { name: '프로필을 다시 활성화할까요?' });
    const cancel = within(dialog).getByRole('button', { name: '취소' });
    await waitFor(() => expect(cancel).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(trigger);
    const reopened = await page.findByRole('dialog', { name: '프로필을 다시 활성화할까요?' });
    await userEvent.click(within(reopened).getByRole('button', { name: '다시 활성화' }));
    await userEvent.keyboard('{Escape}');
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).toHaveBeenCalledWith('reactivate');
    await expect(canvas.getByRole('button', { name: /프로필 비활성화/ })).toBeVisible();
    await waitFor(() =>
      expect(page.getByRole('alert')).toHaveTextContent('프로필을 다시 활성화했어요.'),
    );
  },
};

export const DeleteRetryContract: Story = {
  args: { action: 'delete', state: 'error' },
  globals: { theme: 'dark', viewport: { value: 'kosmoMobile', isRotated: false } },
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole('alertdialog', { name: '프로필을 영구 삭제할까요?' });
    const surface = within(dialog);
    await expect(surface.getByRole('checkbox')).toBeChecked();
    await expect(
      await surface.findByText('프로필을 삭제하지 못했어요. 다시 시도해주세요.'),
    ).toBeVisible();
    await userEvent.click(surface.getByRole('button', { name: '영구 삭제' }));
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
    await expect(args.onRetry).toHaveBeenCalledWith('delete');
    await waitFor(() => expect(page.queryByRole('alertdialog')).not.toBeInTheDocument());
    await expect(
      within(canvasElement).getByText('삭제한 프로필은 복구할 수 없습니다.'),
    ).toBeVisible();
  },
};

export const DeleteSuccessContract: Story = {
  args: { action: 'delete' },
  globals: { reduceMotion: false },
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /영구 삭제/ }));
    const dialog = await page.findByRole('alertdialog', { name: '프로필을 영구 삭제할까요?' });
    const surface = within(dialog);
    await waitFor(() => expect(surface.getByRole('button', { name: '취소' })).toHaveFocus());
    const confirm = surface.getByRole('button', { name: '영구 삭제' });
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(surface.getByRole('checkbox'));
    await userEvent.click(confirm);
    await expect(confirm).toHaveAttribute('aria-busy', 'true');
    await waitFor(() =>
      expect(
        within(canvasElement).getByText('삭제한 프로필은 복구할 수 없습니다.'),
      ).toBeInTheDocument(),
    );
    const closingDialog = page.getByRole('alertdialog');
    within(closingDialog).getByRole('button', { name: '닫기' }).click();
    await expect(args.onCancel).not.toHaveBeenCalled();
    await waitFor(() => expect(page.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(canvasElement.ownerDocument.activeElement?.textContent).toBe('프로필 설정'),
    );
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).toHaveBeenCalledWith('delete');
    await expect(within(canvasElement).queryByText('@selected')).not.toBeInTheDocument();
    await waitFor(() => expect(page.getByRole('alert')).toHaveTextContent('프로필을 삭제했어요.'));
  },
};

export const DeleteErrorContract: Story = {
  args: { action: 'delete', outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: /영구 삭제/ });
    await userEvent.click(trigger);
    const dialog = await page.findByRole('alertdialog', { name: '프로필을 영구 삭제할까요?' });
    const surface = within(dialog);
    const checkbox = surface.getByRole('checkbox');
    await userEvent.click(checkbox);
    await userEvent.click(surface.getByRole('button', { name: '영구 삭제' }));
    await waitFor(() =>
      expect(surface.getByText('프로필을 삭제하지 못했어요. 다시 시도해주세요.')).toBeVisible(),
    );
    await expect(checkbox).toBeChecked();
    await expect(surface.getByRole('button', { name: '영구 삭제' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.keyboard('{Escape}');
    // The retiring surface must not dispatch another cancel while its exit motion is running.
    page
      .queryByRole('alertdialog')
      ?.querySelector<HTMLButtonElement>('[aria-label="닫기"]')
      ?.click();
    await waitFor(() => expect(page.queryByRole('alertdialog')).not.toBeInTheDocument());
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    const reopened = await page.findByRole('alertdialog', { name: '프로필을 영구 삭제할까요?' });
    await expect(within(reopened).getByRole('checkbox')).not.toBeChecked();
  },
};

export const PendingContract: Story = {
  args: { action: 'delete', state: 'pending' },
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole('alertdialog', { name: '프로필을 영구 삭제할까요?' });
    const surface = within(dialog);
    await expect(surface.getByRole('checkbox')).toBeChecked();
    await expect(surface.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true');
    for (const name of ['취소', '영구 삭제', '닫기']) {
      const button = surface.getByRole('button', { name });
      await expect(button).toHaveAttribute('aria-disabled', 'true');
      button.click();
    }
    await userEvent.keyboard('{Escape}');
    await expect(dialog).toBeVisible();
    await expect(args.onCancel).not.toHaveBeenCalled();
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};
