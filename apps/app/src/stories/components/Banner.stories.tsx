import { Bell, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { space } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { BannerProps } from '@/components/ui/Banner';

const longMessage = '내 프로필의 표시 이름과 소개, 대표 이미지가 최신 정보인지 확인해 주세요.';

const meta = {
  args: { message: '프로필을 완성해 보세요' },
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
    'OptionalControlsContract',
  ],
  title: 'KOSMO/Components/Banner',
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

const banner320Viewport = {
  globals: { viewport: { isRotated: false, value: 'banner320' } },
  parameters: {
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
} satisfies Pick<Story, 'globals' | 'parameters'>;

export const Playground: Story = {
  args: { icon: UserRound, onDismiss: fn() },
  parameters: { controls: { include: ['message'] } },
  render: (args) => <InteractiveBanner {...args} />,
};

export const Plain: Story = {
  args: { message: '공개 프로필에 표시할 정보를 확인해 주세요.' },
  parameters: { controls: { disable: true } },
};

export const LongMessage320: Story = {
  ...banner320Viewport,
  args: { message: longMessage },
  parameters: { ...banner320Viewport.parameters, controls: { disable: true } },
  render: ({ message }) => (
    <Banner
      action={<Button size="compact">프로필 확인</Button>}
      icon={UserRound}
      message={message}
      onDismiss={() => {}}
    />
  ),
};

export const HomeNotification: Story = {
  ...banner320Viewport,
  args: { icon: Bell, message: '푸시 알림 받기', onDismiss: fn() },
  parameters: { ...banner320Viewport.parameters, controls: { disable: true } },
  render: ({ icon, message, onDismiss }) => (
    <View style={{ marginHorizontal: space[12] }}>
      <Banner
        action={
          <Button accessibilityLabel="푸시 알림 켜기" size="compact">
            켜기
          </Button>
        }
        icon={icon}
        message={message}
        onDismiss={onDismiss}
      />
    </View>
  ),
};

export const Dark: Story = {
  args: { icon: UserRound, message: '프로필을 완성해 보세요', onDismiss: fn() },
  globals: { theme: 'dark' },
  parameters: { controls: { disable: true } },
  render: ({ icon, message, onDismiss }) => (
    <Banner
      action={<Button size="compact">프로필 확인</Button>}
      icon={icon}
      message={message}
      onDismiss={onDismiss}
    />
  ),
};

export const CallerPending: Story = {
  args: { icon: UserRound, message: '프로필을 완성해 보세요', onDismiss: fn() },
  parameters: { controls: { disable: true } },
  render: ({ icon, message, onDismiss }) => (
    <Banner
      action={
        <Button loading size="compact">
          프로필 확인
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
  ...LongMessage320,
  args: { icon: UserRound, message: longMessage, onDismiss: fn() },
  render: ({ icon, message, onDismiss }) => (
    <PendingInteractiveBanner icon={icon} message={message} onDismiss={onDismiss} />
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await canvasElement.ownerDocument.fonts.ready;
    const action = canvas.getByRole('button', { name: '프로필 확인' });
    const dismiss = canvas.getByRole('button', { name: '배너 닫기' });
    const message = canvas.getByText(args.message);
    const banner = message.parentElement;
    const actionWidth = action.getBoundingClientRect().width;
    const messageWidth = message.getBoundingClientRect().width;

    expect(canvasElement.ownerDocument.documentElement.clientWidth).toBe(320);
    await expect(action).toBeEnabled();
    await expect(dismiss).toBeEnabled();

    await userEvent.click(action);

    const pendingAction = canvas.getByRole('button', { name: '프로필 확인' });
    await expect(pendingAction).toBeDisabled();
    await expect(canvas.getByRole('progressbar', { name: '프로필 확인 처리 중' })).toBeVisible();
    await expect(dismiss).toBeDisabled();
    dismiss.click();
    expect(pendingAction.getBoundingClientRect().width).toBeLessThanOrEqual(actionWidth + 1);
    expect(message.getBoundingClientRect().width).toBeGreaterThanOrEqual(messageWidth - 1);
    expect(banner?.scrollWidth).toBeLessThanOrEqual(banner?.clientWidth ?? 0);
    expect(args.onDismiss).not.toHaveBeenCalled();
  },
};

export const OptionalControlsContract: Story = {
  ...Plain,
  parameters: { controls: { disable: true } },
  render: () => <OptionalControlsFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const actionMessage = canvas.getByText('공개 프로필의 정보를 확인해 주세요.');
    const dismissMessage = canvas.getByText('현재 공개 범위를 확인해 주세요.');
    const actionBanner = actionMessage.parentElement!;
    const dismissBanner = dismissMessage.parentElement!;
    const action = within(actionBanner).getByRole('button', { name: '프로필 확인' });
    const dismiss = within(dismissBanner).getByRole('button', { name: '배너 닫기' });

    expect(
      within(actionBanner).queryByRole('button', { name: '배너 닫기' }),
    ).not.toBeInTheDocument();
    expect(
      within(dismissBanner).queryByRole('button', { name: '프로필 확인' }),
    ).not.toBeInTheDocument();

    await userEvent.click(action);
    await expect(
      within(actionBanner).getByRole('button', { name: '프로필 다시 확인' }),
    ).toBeVisible();

    await userEvent.click(dismiss);
    await expect(canvas.queryByText('현재 공개 범위를 확인해 주세요.')).not.toBeInTheDocument();
    expect(canvas.getByText('공개 프로필의 정보를 확인해 주세요.')).toBeVisible();
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
    const action = canvas.getByRole('button', { name: '프로필 확인' });
    expect(action).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('button', { name: '프로필 다시 확인' })).toHaveFocus();
    expect(canvas.getByText(args.message)).toBeVisible();

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
  const [actionPerformed, setActionPerformed] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return null;
  }

  return (
    <Banner
      {...props}
      action={
        <Button onPress={() => setActionPerformed(true)} size="compact">
          {actionPerformed ? '프로필 다시 확인' : '프로필 확인'}
        </Button>
      }
      onDismiss={() => {
        props.onDismiss?.();
        setVisible(false);
      }}
    />
  );
}

function OptionalControlsFixture() {
  const [actionPerformed, setActionPerformed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  return (
    <View style={{ gap: space[8] }}>
      <Banner
        action={
          <Button onPress={() => setActionPerformed(true)} size="compact">
            {actionPerformed ? '프로필 다시 확인' : '프로필 확인'}
          </Button>
        }
        message="공개 프로필의 정보를 확인해 주세요."
      />
      {dismissed ? null : (
        <Banner message="현재 공개 범위를 확인해 주세요." onDismiss={() => setDismissed(true)} />
      )}
    </View>
  );
}

function PendingInteractiveBanner({
  icon,
  message,
  onDismiss,
}: Pick<BannerProps, 'icon' | 'message' | 'onDismiss'>) {
  const [pending, setPending] = useState(false);

  return (
    <Banner
      action={
        <Button loading={pending} onPress={() => setPending(true)} size="compact">
          프로필 확인
        </Button>
      }
      dismissDisabled={pending}
      icon={icon}
      message={message}
      onDismiss={onDismiss}
    />
  );
}
