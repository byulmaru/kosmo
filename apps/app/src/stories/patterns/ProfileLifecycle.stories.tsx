import { useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ProfileLifecycle } from '@/components/profile/ProfileLifecycle';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  ProfileLifecycleAction,
  ProfileLifecycleState,
} from '@/components/profile/ProfileLifecycle';

type Args = {
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

function LifecycleExample(args: Args) {
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
    <View style={{ alignSelf: 'center', maxWidth: 640, minHeight: 700, width: '100%' }}>
      <ProfileLifecycle
        profile={{
          id: 'lifecycle-profile',
          displayName: args.displayName,
          relativeHandle: args.relativeHandle,
        }}
        state={state}
        onAction={(action) => {
          args.onAction(action);
          setState({ action, phase: 'idle' });
        }}
        onCancel={() => {
          args.onCancel();
          setState({ action: state.action, phase: 'entry' });
        }}
        onConfirm={(action) => void request(action, false)}
        onRetry={(action) => void request(action, true)}
      />
    </View>
  );
}

const meta = {
  args: {
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
    action: { control: 'inline-radio', options: ['deactivate', 'reactivate', 'delete'] },
    state: { control: 'select', options: ['entry', 'idle', 'pending', 'error', 'success'] },
    outcome: { control: 'inline-radio', options: ['success', 'error', 'pending'] },
  },
  component: LifecycleExample,
  excludeStories: [
    'DeactivateContract',
    'ReactivateContract',
    'DeleteRetryContract',
    'DeleteSuccessContract',
    'DeleteErrorContract',
    'PendingContract',
  ],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
  render: (args) => (
    <LifecycleExample key={`${args.action}:${args.state}:${args.outcome}`} {...args} />
  ),
  title: 'KOSMO/Patterns/Profile/Lifecycle',
} satisfies Meta<typeof LifecycleExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['action', 'state', 'outcome', 'displayName', 'relativeHandle'],
    },
  },
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

export const DeactivateContract: Story = {
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
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
    confirm.click();
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).toHaveBeenCalledWith('deactivate');
    await waitFor(() => expect(canvas.getByText('이 프로필은 비활성 상태예요')).toBeVisible());
    await expect(canvas.getByRole('button', { name: '다시 활성화' })).toBeVisible();
    await expect(args.onAction).toHaveBeenCalledTimes(1);
    await expect(args.onAction).toHaveBeenCalledWith('deactivate');
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
