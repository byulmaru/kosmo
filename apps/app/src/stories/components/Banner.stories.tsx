import { Bell } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { BannerProps } from '@/components/ui/Banner';

const longMessage = '함께 만드는 오픈소스 프로젝트와 디자인 시스템의 새 소식 받아보기';

const meta = {
  args: { message: '알림 받기' },
  argTypes: { onDismiss: { control: false } },
  component: Banner,
  decorators: [
    (Story) => (
      <View style={{ maxWidth: 420, width: '100%' }}>
        <Story />
      </View>
    ),
  ],
  excludeStories: [
    'InteractionContract',
    'PlainContract',
    'LongMessage320Contract',
    'CallerPendingContract',
  ],
  title: 'KOSMO/Components/Banner',
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { icon: Bell, onDismiss: fn() },
  parameters: { controls: { include: ['message'] } },
  render: (args) => <InteractiveBanner {...args} />,
};

export const Plain: Story = {
  args: { message: '알림 받기' },
  parameters: { controls: { disable: true } },
  render: ({ message }) => <Banner message={message} />,
};

export const LongMessage320: Story = {
  args: { message: longMessage },
  globals: { viewport: { isRotated: false, value: 'banner320' } },
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    viewport: {
      options: {
        banner320: {
          name: 'Banner 320px',
          styles: { height: '640px', width: '320px' },
          type: 'mobile',
        },
      },
    },
  },
  render: ({ message }) => (
    <Banner
      action={
        <Button onPress={() => {}} size="compact">
          알림 켜기
        </Button>
      }
      icon={Bell}
      message={message}
      onDismiss={() => {}}
    />
  ),
};

export const Dark: Story = {
  args: { icon: Bell, message: '알림 받기', onDismiss: fn() },
  globals: { theme: 'dark' },
  parameters: { controls: { disable: true } },
  render: ({ icon, message, onDismiss }) => (
    <Banner
      action={
        <Button onPress={() => {}} size="compact">
          알림 켜기
        </Button>
      }
      icon={icon}
      message={message}
      onDismiss={onDismiss}
    />
  ),
};

export const CallerPending: Story = {
  args: { icon: Bell, message: '알림 받기', onDismiss: fn() },
  parameters: { controls: { disable: true } },
  render: ({ icon, message, onDismiss }) => (
    <Banner
      action={
        <Button loading loadingText="알림 설정 중" size="compact">
          알림 켜기
        </Button>
      }
      dismissDisabled
      icon={icon}
      message={message}
      onDismiss={onDismiss}
    />
  ),
};

export const CallerPendingContract: Story = {
  ...CallerPending,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const action = canvas.getByRole('button', { name: '알림 켜기' });
    const dismiss = canvas.getByRole('button', { name: '배너 닫기' });

    await expect(action).toBeDisabled();
    await expect(canvas.getByLabelText('알림 켜기 처리 중')).toBeVisible();
    await expect(dismiss).toBeDisabled();
    action.click();
    dismiss.click();
    expect(args.onDismiss).not.toHaveBeenCalled();
  },
};

export const InteractionContract: Story = {
  ...Playground,
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(args.message)).toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.tab();
    const action = canvas.getByRole('button', { name: '알림 켜기' });
    expect(action).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(canvas.getByRole('button', { name: '알림 켜짐' })).toHaveFocus();

    await userEvent.tab();
    const dismiss = canvas.getByRole('button', { name: '배너 닫기' });
    expect(dismiss).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(args.onDismiss).toHaveBeenCalledOnce();
    expect(canvas.queryByText(args.message)).not.toBeInTheDocument();
  },
};

export const PlainContract: Story = {
  ...Plain,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByText(args.message)).toBeVisible();
    expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const LongMessage320Contract: Story = {
  ...LongMessage320,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const text = canvas.getByText(args.message);
    const banner = text.parentElement;
    const textBounds = text.getBoundingClientRect();

    expect(canvasElement.ownerDocument.documentElement.clientWidth).toBe(320);
    expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth);
    expect(textBounds.height).toBeGreaterThan(20);
    expect(textBounds.right).toBeLessThanOrEqual(320);
    expect(banner?.scrollWidth).toBeLessThanOrEqual(banner?.clientWidth ?? 0);
  },
};

function InteractiveBanner(props: BannerProps) {
  const [actionCompleted, setActionCompleted] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return null;
  }

  return (
    <Banner
      {...props}
      action={
        <Button onPress={() => setActionCompleted(true)} size="compact">
          {actionCompleted ? '알림 켜짐' : '알림 켜기'}
        </Button>
      }
      onDismiss={() => {
        props.onDismiss?.();
        setVisible(false);
      }}
    />
  );
}
