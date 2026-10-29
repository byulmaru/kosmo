import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NotificationPermissionBanner } from '@/components/ui/NotificationPermissionBanner';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  args: { onDismiss: fn(), onEnable: fn(), pending: false },
  argTypes: { pending: { control: 'boolean' } },
  component: NotificationPermissionBanner,
  decorators: [
    (Story) => (
      <View style={{ maxWidth: 420, width: '100%' }}>
        <Story />
      </View>
    ),
  ],
  excludeStories: ['EnableAndDismissContract', 'PendingContract'],
  title: 'KOSMO/Components/NotificationPermissionBanner',
} satisfies Meta<typeof NotificationPermissionBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: { controls: { include: ['pending'] } },
};

export const Narrow320: Story = {
  globals: { viewport: { isRotated: false, value: 'notificationBanner320' } },
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: {
        notificationBanner320: {
          name: 'Notification banner 320px',
          styles: { height: '640px', width: '320px' },
          type: 'mobile',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const label = canvas.getByText('알림 받기');
    const enable = canvas.getByRole('button', { name: '알림 켜기' });
    const dismiss = canvas.getByRole('button', { name: '배너 닫기' });
    const enableTarget = enable.getBoundingClientRect();
    const dismissTarget = dismiss.getBoundingClientRect();

    expect(canvasElement.ownerDocument.documentElement.clientWidth).toBe(320);
    expect(enableTarget.width).toBeGreaterThanOrEqual(72);
    expect(enableTarget.height).toBeGreaterThanOrEqual(32);
    expect(dismissTarget.width).toBeGreaterThanOrEqual(32);
    expect(dismissTarget.height).toBeGreaterThanOrEqual(32);
    expect(enableTarget.left).toBeGreaterThanOrEqual(0);
    expect(dismissTarget.right).toBeLessThanOrEqual(320);
    expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
  },
};

export const Pending: Story = {
  args: { pending: true },
  parameters: { controls: { disable: true } },
};

export const EnableAndDismissContract: Story = {
  args: { pending: false },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    args.onEnable.mockClear();
    args.onDismiss.mockClear();

    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '알림 켜기' }));
    expect(args.onEnable).toHaveBeenCalledOnce();
    expect(args.onDismiss).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('button', { name: '배너 닫기' }));
    expect(args.onDismiss).toHaveBeenCalledOnce();
  },
};

export const PendingContract: Story = {
  args: { pending: true },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    args.onEnable.mockClear();
    args.onDismiss.mockClear();

    const canvas = within(canvasElement);
    const enable = canvas.getByRole('button', { name: '알림 켜기' });
    const dismiss = canvas.getByRole('button', { name: '배너 닫기' });

    await expect(enable).toBeDisabled();
    await expect(canvas.getByLabelText('알림 켜기 처리 중')).toBeVisible();
    await expect(dismiss).toBeDisabled();
    enable.click();
    dismiss.click();
    expect(args.onEnable).not.toHaveBeenCalled();
    expect(args.onDismiss).not.toHaveBeenCalled();
  },
};
