import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { BottomTabBar } from '@/components/ui/BottomTabBar';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  BottomTabBarProps,
  BottomTabDestination,
  NavigationProfile,
} from '@/components/ui/navigationChrome';

type CatalogProps = Omit<BottomTabBarProps, 'profile'> & {
  profileAvailable: boolean;
};

const profile = {
  imageUri: null,
  label: '사샤',
} satisfies NavigationProfile;

const destinationLabels = {
  compose: '글쓰기',
  home: '홈',
  notifications: '알림',
  profile: '프로필',
  search: '검색',
} satisfies Record<BottomTabDestination, string>;

const iconDestinations = ['home', 'search', 'compose', 'notifications'] as const;

function BottomTabBarCatalog({
  currentDestination = null,
  onNavigate,
  platform = 'web',
  profileAvailable,
  safeAreaBottom = 0,
  unreadNotificationCount = null,
}: CatalogProps) {
  const [destination, setDestination] = useState<BottomTabDestination | null>(currentDestination);

  useEffect(() => setDestination(currentDestination), [currentDestination]);

  return (
    <View style={{ width: 390 }}>
      <BottomTabBar
        currentDestination={destination}
        onNavigate={(nextDestination) => {
          onNavigate(nextDestination);
          setDestination(nextDestination);
        }}
        platform={platform}
        profile={profileAvailable ? profile : null}
        safeAreaBottom={safeAreaBottom}
        unreadNotificationCount={unreadNotificationCount}
      />
    </View>
  );
}

const meta = {
  args: {
    currentDestination: 'home',
    onNavigate: fn(),
    platform: 'web',
    profileAvailable: true,
    safeAreaBottom: 0,
    unreadNotificationCount: null,
  },
  argTypes: {
    currentDestination: {
      control: 'select',
      options: [null, 'home', 'search', 'compose', 'notifications', 'profile'],
    },
    platform: { control: 'inline-radio', options: ['web', 'ios', 'android'] },
    safeAreaBottom: { control: { min: 0, step: 4, type: 'number' } },
    unreadNotificationCount: { control: { min: 0, step: 1, type: 'number' } },
  },
  component: BottomTabBarCatalog,
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
  title: 'KOSMO/Components/Bottom Tab Bar',
} satisfies Meta<typeof BottomTabBarCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playground: Story = {
  args: { currentDestination: 'notifications', unreadNotificationCount: 3 },
  parameters: {
    controls: {
      disable: false,
      include: [
        'currentDestination',
        'platform',
        'profileAvailable',
        'safeAreaBottom',
        'unreadNotificationCount',
      ],
    },
  },
  play: async ({ args, canvasElement, step }) => {
    args.onNavigate.mockClear();
    const canvas = within(canvasElement);
    const navigation = canvas.getByRole('navigation', { name: '하단 탐색' });
    const controls = within(navigation).getAllByRole('button');
    const home = within(navigation).getByRole('button', { name: '홈' });
    const search = within(navigation).getByRole('button', { name: '검색' });
    const unreadNotificationCount = args.unreadNotificationCount ?? 0;
    const notificationName =
      unreadNotificationCount > 0 ? `알림, 읽지 않은 알림 ${unreadNotificationCount}개` : '알림';
    const notifications = within(navigation).getByRole('button', { name: notificationName });
    const profileControl = within(navigation).getByRole('button', { name: '프로필' });
    const selectedDestination =
      args.currentDestination === 'profile' && !args.profileAvailable
        ? null
        : args.currentDestination;
    const outlineDestination =
      iconDestinations.find((destination) => destination !== selectedDestination) ?? 'home';

    await step('탐색 구조와 선택 상태 확인', async () => {
      expect(controls).toHaveLength(5);
      expect(navigation).toHaveAccessibleName('하단 탐색');
      if (selectedDestination) {
        const selected = within(navigation).getByRole('button', {
          name:
            selectedDestination === 'notifications'
              ? notificationName
              : destinationLabels[selectedDestination],
        });
        expect(selected).toHaveAttribute('aria-current', 'page');
        expect(within(selected).getByText(destinationLabels[selectedDestination])).toBeVisible();
        if (selectedDestination !== 'profile') {
          expect(
            within(selected).getByTestId(`bottom-tab-${selectedDestination}-filled-icon`),
          ).toBeVisible();
        }
      } else {
        expect(controls.every((control) => !control.hasAttribute('aria-current'))).toBe(true);
      }

      const outlineControl = within(navigation).getByRole('button', {
        name: destinationLabels[outlineDestination],
      });
      expect(
        within(outlineControl).getByTestId(`bottom-tab-${outlineDestination}-outline-icon`),
      ).toBeVisible();
      expect(
        within(outlineControl).queryByTestId(`bottom-tab-${outlineDestination}-filled-icon`),
      ).not.toBeInTheDocument();

      expect(notifications).toHaveAccessibleName(notificationName);
      if (unreadNotificationCount > 0) {
        const unreadIndicator = within(notifications).getByTestId('bottom-tab-unread-indicator');
        expect(unreadIndicator).toBeVisible();
        expect(unreadIndicator).toHaveStyle({ right: '2px', top: '-1px' });
      } else {
        expect(
          within(notifications).queryByTestId('bottom-tab-unread-indicator'),
        ).not.toBeInTheDocument();
      }

      if (!args.profileAvailable) {
        expect(profileControl).toHaveAttribute('aria-disabled', 'true');
        expect(profileControl).toBeDisabled();
        expect(within(profileControl).queryByRole('img')).not.toBeInTheDocument();
        profileControl.click();
        expect(args.onNavigate).not.toHaveBeenCalled();
      }
    });

    await step('키보드 선택과 callback 확인', async () => {
      await userEvent.tab();
      expect(home).toHaveFocus();
      await userEvent.tab();
      expect(search).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      expect(args.onNavigate).toHaveBeenLastCalledWith('search');
      await waitFor(() => expect(search).toHaveAttribute('aria-current', 'page'));
    });

    await step('Pressed visual과 고정 target 확인', async () => {
      const visual = within(notifications).getByTestId('bottom-tab-notifications-visual');
      await userEvent.pointer({ keys: '[MouseLeft>]', target: notifications });
      await waitFor(() =>
        expect(getComputedStyle(visual).transform).toBe('matrix(0.98, 0, 0, 0.98, 0, 0)'),
      );
      expect(getComputedStyle(visual).transitionDuration).toBe(
        args.platform === 'web' ? '0.12s' : '0s',
      );
      expect(visual).toHaveStyle({ height: '64px', width: '64px' });
      expect(notifications).toHaveStyle({
        height: args.platform === 'web' ? '80px' : '56px',
      });
      await userEvent.pointer({ keys: '[/MouseLeft]', target: notifications });

      args.onNavigate.mockClear();
      await userEvent.click(notifications);
      expect(args.onNavigate).toHaveBeenLastCalledWith('notifications');
      await waitFor(() => expect(notifications).toHaveAttribute('aria-current', 'page'));
    });
  },
};

export const ReducedMotion: Story = {
  args: { unreadNotificationCount: 3 },
  globals: { reduceMotion: true },
  play: async ({ canvasElement }) => {
    const navigation = within(canvasElement).getByRole('navigation', { name: '하단 탐색' });
    const notifications = within(navigation).getByRole('button', {
      name: '알림, 읽지 않은 알림 3개',
    });
    const visual = within(notifications).getByTestId('bottom-tab-notifications-visual');

    await userEvent.pointer({ keys: '[MouseLeft>]', target: notifications });
    expect(getComputedStyle(visual).transform).toBe('none');
    expect(getComputedStyle(visual).transitionDuration).toBe('0s');
    expect(notifications).toHaveStyle({ height: '80px' });
    await userEvent.pointer({ keys: '[/MouseLeft]', target: notifications });
  },
};

export const ProfileUnavailable: Story = {
  args: { currentDestination: 'profile', profileAvailable: false },
  play: async ({ args, canvasElement }) => {
    args.onNavigate.mockClear();
    const navigation = within(canvasElement).getByRole('navigation', { name: '하단 탐색' });
    const profileControl = within(navigation).getByRole('button', { name: '프로필' });

    expect(profileControl).toBeDisabled();
    expect(profileControl).toHaveAttribute('aria-disabled', 'true');
    expect(profileControl).not.toHaveAttribute('aria-current', 'page');
    profileControl.click();
    expect(args.onNavigate).not.toHaveBeenCalled();
  },
};

const safeAreaPlay: Story['play'] = async ({ args, canvasElement }) => {
  const navigation = within(canvasElement).getByRole('navigation', { name: '하단 탐색' });
  const expectedHeight = 56 + (args.safeAreaBottom ?? 0);
  expect(navigation).toHaveStyle({ height: `${expectedHeight}px` });
};

export const IosSafeArea: Story = {
  args: { platform: 'ios', safeAreaBottom: 52 },
  play: safeAreaPlay,
};

export const AndroidSafeArea: Story = {
  args: { platform: 'android', safeAreaBottom: 40 },
  play: safeAreaPlay,
};

export const DarkSelected: Story = {
  args: { currentDestination: 'notifications' },
  globals: {
    backgrounds: { value: 'kosmoDark' },
    theme: 'dark',
  },
};
