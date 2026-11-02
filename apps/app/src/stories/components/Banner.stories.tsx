import { Bell, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { space } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { BannerProps } from '@/components/ui/Banner';

const longMessage = '내 프로필의 표시 이름과 소개, 대표 이미지가 최신 정보인지 확인해 주세요.';
const dismissalKey = 'kosmo:storybook:banner-dismissal';
const persistentDismissalKey = 'kosmo:storybook:banner-persistence';
const alternateDismissalKey = 'kosmo:storybook:banner-persistence-alternate';
const failingDismissalKey = 'kosmo:storybook:banner-storage-failure';

const meta = {
  args: { message: '프로필을 완성해 보세요' },
  beforeEach: () => {
    for (const key of [
      dismissalKey,
      persistentDismissalKey,
      alternateDismissalKey,
      failingDismissalKey,
    ]) {
      globalThis.localStorage?.removeItem(key);
    }
  },
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
    'DismissalPersistenceContract',
    'StorageReadFailureContract',
    'StorageWriteFailureContract',
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
  args: { dismissalKey, icon: UserRound },
  parameters: { controls: { include: ['message'] } },
  render: (args) => <InteractiveBanner {...args} />,
};

export const Plain: Story = {
  args: { message: '공개 프로필에 표시할 정보를 확인해 주세요.' },
  parameters: { controls: { disable: true } },
};

export const LongMessage320: Story = {
  ...banner320Viewport,
  args: { dismissalKey, message: longMessage },
  parameters: { ...banner320Viewport.parameters, controls: { disable: true } },
  render: ({ dismissalKey: key, message }) => (
    <Banner
      action={<Button size="compact">프로필 확인</Button>}
      dismissalKey={key}
      icon={UserRound}
      message={message}
    />
  ),
};

export const HomeNotification: Story = {
  ...banner320Viewport,
  args: { dismissalKey, icon: Bell, message: '푸시 알림 받기' },
  parameters: { ...banner320Viewport.parameters, controls: { disable: true } },
  render: ({ dismissalKey: key, icon, message }) => (
    <Banner
      action={
        <Button accessibilityLabel="푸시 알림 켜기" size="compact">
          켜기
        </Button>
      }
      dismissalKey={key}
      icon={icon}
      message={message}
      style={{ marginHorizontal: space[12], marginVertical: space[12] }}
    />
  ),
};

export const Dark: Story = {
  args: { dismissalKey, icon: UserRound, message: '프로필을 완성해 보세요' },
  globals: { theme: 'dark' },
  parameters: { controls: { disable: true } },
  render: ({ dismissalKey: key, icon, message }) => (
    <Banner
      action={<Button size="compact">프로필 확인</Button>}
      dismissalKey={key}
      icon={icon}
      message={message}
    />
  ),
};

export const CallerPending: Story = {
  args: { dismissalKey, icon: UserRound, message: '프로필을 완성해 보세요' },
  parameters: { controls: { disable: true } },
  render: ({ dismissalKey: key, icon, message }) => (
    <Banner
      action={
        <Button loading size="compact">
          프로필 확인
        </Button>
      }
      dismissalKey={key}
      dismissDisabled
      icon={icon}
      message={message}
    />
  ),
};

export const CallerPendingContract: Story = {
  ...LongMessage320,
  args: { dismissalKey, icon: UserRound, message: longMessage },
  render: ({ dismissalKey: key, icon, message }) => (
    <PendingInteractiveBanner dismissalKey={key} icon={icon} message={message} />
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
    expect(canvas.getByText(args.message)).toBeVisible();
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
  args: { dismissalKey, icon: UserRound, message: '프로필을 완성해 보세요' },
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

    await expect(canvas.queryByText(args.message)).not.toBeInTheDocument();
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

export const DismissalPersistenceContract: Story = {
  args: { dismissalKey: persistentDismissalKey },
  parameters: { controls: { disable: true } },
  render: () => <DismissalFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '배너 닫기' }));
    await expect(canvas.queryByText('첫 번째 배너')).not.toBeInTheDocument();
    expect(globalThis.localStorage.getItem(persistentDismissalKey)).toBe('1');

    await userEvent.click(canvas.getByRole('button', { name: '배너 다시 마운트' }));
    expect(canvas.queryByText('첫 번째 배너')).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: '다른 배너 표시' }));
    expect(canvas.getByText('다른 배너')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '첫 번째 배너 표시' }));
    expect(canvas.queryByText('첫 번째 배너')).not.toBeInTheDocument();
  },
};

export const StorageReadFailureContract: Story = {
  args: { dismissalKey: failingDismissalKey, message: '저장소를 읽을 수 없는 배너' },
  beforeEach: () => overrideLocalStorageMethod('getItem'),
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    await expect(within(canvasElement).findByText(args.message)).resolves.toBeVisible();
  },
};

export const StorageWriteFailureContract: Story = {
  args: { dismissalKey: failingDismissalKey, message: '저장소에 쓸 수 없는 배너' },
  beforeEach: () => overrideLocalStorageMethod('setItem'),
  parameters: { controls: { disable: true } },
  render: ({ dismissalKey: key, message }) => (
    <RemountingBanner dismissalKey={key} message={message} />
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '배너 닫기' }));
    await expect(canvas.queryByText(args.message)).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: '배너 다시 마운트' }));
    await expect(canvas.findByText(args.message)).resolves.toBeVisible();
  },
};

function InteractiveBanner(props: BannerProps) {
  const [actionPerformed, setActionPerformed] = useState(false);

  return (
    <Banner
      {...props}
      action={
        <Button onPress={() => setActionPerformed(true)} size="compact">
          {actionPerformed ? '프로필 다시 확인' : '프로필 확인'}
        </Button>
      }
    />
  );
}

function DismissalFixture() {
  const [currentKey, setCurrentKey] = useState(persistentDismissalKey);
  const [mountKey, setMountKey] = useState(0);

  return (
    <View style={{ gap: space[8] }}>
      <Button onPress={() => setMountKey((key) => key + 1)}>배너 다시 마운트</Button>
      <Button onPress={() => setCurrentKey(alternateDismissalKey)}>다른 배너 표시</Button>
      <Button onPress={() => setCurrentKey(persistentDismissalKey)}>첫 번째 배너 표시</Button>
      <Banner
        key={mountKey}
        dismissalKey={currentKey}
        message={currentKey === persistentDismissalKey ? '첫 번째 배너' : '다른 배너'}
        style={{ marginVertical: space[12] }}
      />
    </View>
  );
}

function RemountingBanner({
  dismissalKey: key,
  message,
}: Pick<BannerProps, 'dismissalKey' | 'message'>) {
  const [mountKey, setMountKey] = useState(0);

  return (
    <View style={{ gap: space[8] }}>
      <Button onPress={() => setMountKey((current) => current + 1)}>배너 다시 마운트</Button>
      <Banner key={mountKey} dismissalKey={key} message={message} />
    </View>
  );
}

function overrideLocalStorageMethod(method: 'getItem' | 'setItem') {
  const storage = globalThis.localStorage;
  const descriptor = Object.getOwnPropertyDescriptor(storage, method);

  Object.defineProperty(storage, method, {
    configurable: true,
    value: () => {
      throw new Error('storage unavailable');
    },
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(storage, method, descriptor);
    } else {
      Reflect.deleteProperty(storage, method);
    }
  };
}

function OptionalControlsFixture() {
  const [actionPerformed, setActionPerformed] = useState(false);

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
      <Banner dismissalKey={dismissalKey} message="현재 공개 범위를 확인해 주세요." />
    </View>
  );
}

function PendingInteractiveBanner({
  dismissalKey,
  icon,
  message,
}: Pick<BannerProps, 'dismissalKey' | 'icon' | 'message'>) {
  const [pending, setPending] = useState(false);

  return (
    <Banner
      action={
        <Button loading={pending} onPress={() => setPending(true)} size="compact">
          프로필 확인
        </Button>
      }
      dismissalKey={dismissalKey}
      dismissDisabled={pending}
      icon={icon}
      message={message}
    />
  );
}
