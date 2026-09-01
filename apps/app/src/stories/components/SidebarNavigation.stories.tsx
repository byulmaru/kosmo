import { useEffect, useState } from 'react';
import { Button, View } from 'react-native';
import { expect, fn, mocked, screen, userEvent, waitFor, within } from 'storybook/test';
import { SidebarNavigation } from '@/components/ui/SidebarNavigation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NavigationDestination, NavigationProfile } from '@/components/ui/navigationChrome';
import type {
  SidebarNavigationProps,
  SidebarPresentation,
} from '@/components/ui/SidebarNavigation';

type CatalogProps = Omit<SidebarNavigationProps, 'profile'> & {
  profileAvailable: boolean;
};

const profile = {
  imageUri: null,
  label: '사샤',
} satisfies NavigationProfile;

const destinations = [
  'home',
  'search',
  'notifications',
  'profile',
  'followRequests',
  'bookmarks',
  'compose',
  'feedback',
  'settings',
] as const satisfies readonly NavigationDestination[];

const labels = {
  bookmarks: '북마크',
  compose: '글쓰기',
  feedback: '피드백 보내기',
  followRequests: '팔로워 요청',
  home: '홈',
  notifications: '알림',
  profile: '프로필',
  search: '검색',
  settings: '설정',
} satisfies Record<NavigationDestination, string>;

function SidebarNavigationCatalog({
  currentDestination = 'home',
  onLogout,
  onMenuOpenChange,
  onNavigate,
  presentation = 'full',
  profileAvailable,
  unreadNotificationCount = null,
}: CatalogProps) {
  const [destination, setDestination] = useState<NavigationDestination | null>(currentDestination);

  useEffect(() => setDestination(currentDestination), [currentDestination]);

  return (
    <View
      style={{
        height: 720,
        width: presentation === 'compact' ? 80 : 320,
      }}
    >
      <SidebarNavigation
        currentDestination={destination}
        onLogout={onLogout}
        onMenuOpenChange={onMenuOpenChange}
        onNavigate={(nextDestination) => {
          onNavigate(nextDestination);
          setDestination(nextDestination);
        }}
        presentation={presentation}
        profile={profileAvailable ? profile : null}
        unreadNotificationCount={unreadNotificationCount}
      />
    </View>
  );
}

function SidebarNavigationTransitionFixture({
  onLogout,
  onMenuOpenChange,
  onNavigate,
}: Pick<SidebarNavigationProps, 'onLogout' | 'onMenuOpenChange' | 'onNavigate'>) {
  const [presentation, setPresentation] = useState<SidebarPresentation>('full');

  return (
    <View>
      <Button
        onPress={() => setPresentation((current) => (current === 'compact' ? 'full' : 'compact'))}
        title={`${presentation === 'compact' ? 'full' : 'compact'}로 전환`}
      />
      <View style={{ height: 720, width: presentation === 'compact' ? 80 : 320 }}>
        <SidebarNavigation
          currentDestination="home"
          onLogout={onLogout}
          onMenuOpenChange={onMenuOpenChange}
          onNavigate={onNavigate}
          presentation={presentation}
          profile={profile}
        />
      </View>
    </View>
  );
}

const meta = {
  args: {
    currentDestination: 'home',
    onLogout: fn(),
    onMenuOpenChange: fn(),
    onNavigate: fn(),
    presentation: 'full',
    profileAvailable: true,
    unreadNotificationCount: null,
  },
  argTypes: {
    currentDestination: {
      control: 'select',
      options: [null, ...destinations],
    },
    presentation: {
      control: 'inline-radio',
      options: ['full', 'compact', 'drawer'],
    },
    profileAvailable: { control: 'boolean' },
    unreadNotificationCount: { control: { min: 0, step: 1, type: 'number' } },
  },
  component: SidebarNavigationCatalog,
  excludeStories: [
    'CompactInteractionContract',
    'DrawerInteractionContract',
    'InteractionContract',
    'PresentationTransitionContract',
    'ProfileUnavailableContract',
    'ReducedMotionContract',
  ],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Sidebar Navigation',
} satisfies Meta<typeof SidebarNavigationCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

function getNavigation(canvasElement: HTMLElement) {
  return within(canvasElement).getByRole('navigation', { name: '주요 메뉴' });
}

function getButton(navigation: HTMLElement, destination: NavigationDestination) {
  return within(navigation).getByRole('button', {
    name:
      destination === 'notifications' ? /^알림(?:, 읽지 않은 알림 \d+개)?$/ : labels[destination],
  });
}

function expectRect(element: HTMLElement, width: number, height: number) {
  const rect = element.getBoundingClientRect();
  expect(rect.width).toBe(width);
  expect(rect.height).toBe(height);
}

async function expectNavigationBasics(
  canvasElement: HTMLElement,
  presentation: 'compact' | 'drawer' | 'full',
  currentDestination: NavigationDestination | null = 'home',
  profileAvailable = true,
  unreadNotificationCount: number | null = null,
) {
  const navigation = getNavigation(canvasElement);
  const home = getButton(navigation, 'home');
  const notificationName =
    unreadNotificationCount && unreadNotificationCount > 0
      ? `알림, 읽지 않은 알림 ${unreadNotificationCount}개`
      : '알림';
  const notifications = within(navigation).getByRole('button', { name: notificationName });
  const currentControls = navigation.querySelectorAll('[aria-current="page"]');
  const currentIsRendered =
    currentDestination !== null &&
    !(currentDestination === 'compose' && presentation !== 'compact') &&
    !(currentDestination === 'profile' && !profileAvailable);

  expect(navigation).toHaveAccessibleName('주요 메뉴');
  if (currentIsRendered) {
    const selected =
      currentDestination === 'settings'
        ? within(navigation).getByRole('button', { name: '설정 및 기타' })
        : getButton(navigation, currentDestination);
    expect(selected).toHaveAttribute('aria-current', 'page');
    expect(currentControls).toHaveLength(1);
  } else {
    expect(currentControls).toHaveLength(0);
  }
  expectRect(home, presentation === 'compact' ? 44 : 272, presentation === 'compact' ? 44 : 45);

  if (presentation === 'compact') {
    expectRect(navigation, 80, 720);
  } else {
    expectRect(home, 272, 45);
    expect(within(notifications).getByText('알림')).toBeVisible();
  }

  if (unreadNotificationCount && unreadNotificationCount > 0) {
    if (presentation === 'compact') {
      expect(within(notifications).getByTestId('sidebar-unread-indicator')).toBeVisible();
      expect(within(notifications).queryByTestId('sidebar-unread-count')).not.toBeInTheDocument();
    } else {
      const count = within(notifications).getByTestId('sidebar-unread-count');
      expect(count).toBeVisible();
      expect(
        within(count).getByText(unreadNotificationCount > 9 ? '9+' : `${unreadNotificationCount}`),
      ).toBeVisible();
      expect(
        within(notifications).queryByTestId('sidebar-unread-indicator'),
      ).not.toBeInTheDocument();
    }
  } else {
    expect(within(notifications).queryByTestId('sidebar-unread-indicator')).not.toBeInTheDocument();
    expect(within(notifications).queryByTestId('sidebar-unread-count')).not.toBeInTheDocument();
  }
}

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expectNavigationBasics(canvasElement, 'full');
  },
};

export const Playground: Story = {
  args: { unreadNotificationCount: 3 },
  parameters: {
    controls: {
      disable: false,
      include: [
        'currentDestination',
        'presentation',
        'profileAvailable',
        'unreadNotificationCount',
      ],
    },
  },
  play: async ({ args, canvasElement, step }) => {
    const navigation = getNavigation(canvasElement);
    const presentation = args.presentation ?? 'full';
    const search = getButton(navigation, 'search');
    const unreadNotificationCount = args.unreadNotificationCount ?? 0;
    const notificationName =
      unreadNotificationCount > 0 ? `알림, 읽지 않은 알림 ${unreadNotificationCount}개` : '알림';
    const notifications = within(navigation).getByRole('button', { name: notificationName });
    const profileButton = getButton(navigation, 'profile');
    const feedback = getButton(navigation, 'feedback');

    await step('내비게이션 이름·현재 목적지·geometry 확인', async () => {
      await expectNavigationBasics(
        canvasElement,
        presentation,
        args.currentDestination ?? null,
        args.profileAvailable,
        unreadNotificationCount,
      );
      expectRect(
        search,
        presentation === 'compact' ? 44 : 272,
        presentation === 'compact' ? 44 : 45,
      );
      expect(feedback.closest('[role="menu"]')).toBeNull();
      if (presentation === 'compact') {
        expectRect(profileButton, 44, 44);
      }
      expect(notifications).toHaveAccessibleName(notificationName);
    });
  },
};

export const InteractionContract: Story = {
  ...Playground,
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement, step }) => {
    args.onNavigate.mockClear();
    const navigation = getNavigation(canvasElement);
    const presentation = args.presentation ?? 'full';
    const home = getButton(navigation, 'home');
    const search = getButton(navigation, 'search');
    const notifications = getButton(navigation, 'notifications');
    const profileButton = getButton(navigation, 'profile');

    await step('Pressed visual과 고정 target 확인', async () => {
      const visual = within(notifications).getByTestId('sidebar-control-visual');
      notifications.focus();
      await waitFor(() => expect(getComputedStyle(notifications).outlineStyle).toBe('solid'));
      await userEvent.pointer({ keys: '[MouseLeft>]', target: notifications });
      await waitFor(() =>
        expect(getComputedStyle(visual).transform).toBe('matrix(0.98, 0, 0, 0.98, 0, 0)'),
      );
      expect(getComputedStyle(visual).transitionDuration).toBe('0.12s');
      expectRect(
        notifications,
        presentation === 'compact' ? 44 : 272,
        presentation === 'compact' ? 44 : 45,
      );
      await userEvent.pointer({ keys: '[/MouseLeft]', target: notifications });
    });

    await step('Tab과 Enter로 destination callback 확인', async () => {
      home.focus();
      await userEvent.tab();
      expect(search).toHaveFocus();
      await waitFor(() => expect(getComputedStyle(search).outlineStyle).toBe('solid'));
      await userEvent.keyboard('{Enter}');
      expect(args.onNavigate).toHaveBeenLastCalledWith('search');
      await waitFor(() => expect(search).toHaveAttribute('aria-current', 'page'));
    });

    await step('프로필이 있으면 프로필 destination을 활성화', async () => {
      if (args.profileAvailable) {
        expect(profileButton).toBeEnabled();
        profileButton.focus();
        await userEvent.keyboard('{Enter}');
        expect(args.onNavigate).toHaveBeenLastCalledWith('profile');
        await waitFor(() => expect(profileButton).toHaveAttribute('aria-current', 'page'));
      }
    });
  },
};

export const ReducedMotion: Story = {
  args: { unreadNotificationCount: 3 },
  globals: { reduceMotion: true },
};

export const ReducedMotionContract: Story = {
  ...ReducedMotion,
  play: async ({ canvasElement }) => {
    const navigation = getNavigation(canvasElement);
    const notifications = within(navigation).getByRole('button', {
      name: '알림, 읽지 않은 알림 3개',
    });
    const visual = within(notifications).getByTestId('sidebar-control-visual');

    await userEvent.pointer({ keys: '[MouseLeft>]', target: notifications });
    expect(getComputedStyle(visual).transform).toBe('none');
    expect(getComputedStyle(visual).transitionDuration).toBe('0s');
    expectRect(notifications, 272, 45);
    await userEvent.pointer({ keys: '[/MouseLeft]', target: notifications });
  },
};

export const Compact: Story = {
  args: { presentation: 'compact', unreadNotificationCount: 3 },
  play: async ({ args, canvasElement, step }) => {
    const navigation = getNavigation(canvasElement);
    const feedback = getButton(navigation, 'feedback');
    const utility = within(navigation).getByRole('button', { name: '설정 및 기타' });

    await step('80px rail과 compact control geometry 확인', async () => {
      await expectNavigationBasics(
        canvasElement,
        'compact',
        args.currentDestination ?? null,
        args.profileAvailable,
        args.unreadNotificationCount,
      );
      expectRect(feedback, 44, 44);
      expectRect(utility, 44, 44);
      for (const destination of [
        'home',
        'search',
        'notifications',
        'profile',
        'followRequests',
        'bookmarks',
        'compose',
      ] as const) {
        expectRect(getButton(navigation, destination), 44, 44);
      }
      expect(feedback.closest('[role="menu"]')).toBeNull();
    });
  },
};

export const CompactInteractionContract: Story = {
  ...Compact,
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement, step }) => {
    args.onLogout.mockClear();
    const onMenuOpenChange = mocked(args.onMenuOpenChange!);
    onMenuOpenChange.mockClear();
    args.onNavigate.mockClear();
    const navigation = getNavigation(canvasElement);
    const utility = within(navigation).getByRole('button', { name: '설정 및 기타' });

    await step('ActionMenu 선택 callback 확인', async () => {
      await userEvent.click(utility);
      expect(onMenuOpenChange).toHaveBeenLastCalledWith(true);
      const menu = await screen.findByRole('menu');
      const settings = within(menu).getByRole('menuitem', { name: labels.settings });
      await userEvent.click(settings);
      expect(args.onNavigate).toHaveBeenLastCalledWith('settings');
      await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(false));

      await userEvent.click(utility);
      const logoutMenu = await screen.findByRole('menu');
      await userEvent.click(within(logoutMenu).getByRole('menuitem', { name: '로그아웃' }));
      expect(args.onLogout).toHaveBeenCalledOnce();
      await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(false));
    });
  },
};

async function playInlineUtility({
  args,
  canvasElement,
}: {
  args: NonNullable<Story['args']>;
  canvasElement: HTMLElement;
}) {
  const onMenuOpenChange = mocked(args.onMenuOpenChange!);
  const onNavigate = mocked(args.onNavigate!);
  onMenuOpenChange.mockClear();
  onNavigate.mockClear();
  const navigation = getNavigation(canvasElement);
  const utility = within(navigation).getByRole('button', { name: '설정 및 기타' });
  const feedback = getButton(navigation, 'feedback');
  const home = getButton(navigation, 'home');

  await expectNavigationBasics(
    canvasElement,
    'drawer',
    args.currentDestination ?? null,
    args.profileAvailable,
    args.unreadNotificationCount,
  );

  expectRect(navigation, 320, 720);
  expectRect(home, 272, 45);
  expectRect(utility, 272, 45);
  expectRect(feedback, 272, 45);
  expect(feedback.closest('[role="menu"]')).toBeNull();

  await userEvent.click(utility);
  expect(onMenuOpenChange).toHaveBeenLastCalledWith(true);
  const settings = within(navigation).getByRole('button', { name: labels.settings });
  const logout = within(navigation).getByRole('button', { name: '로그아웃' });
  expect(settings).toBeVisible();
  expect(logout).toBeVisible();
  expectRect(settings, 272, 45);
  expectRect(logout, 272, 45);
  expect(feedback.closest('[role="menu"]')).toBeNull();

  await userEvent.click(settings);
  expect(onNavigate).toHaveBeenLastCalledWith('settings');
  await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(false));
  expect(within(navigation).queryByRole('button', { name: labels.settings })).toBeNull();
  expect(within(navigation).queryByRole('button', { name: '로그아웃' })).toBeNull();
}

export const Drawer: Story = {
  args: { presentation: 'drawer', unreadNotificationCount: 10 },
};

export const DrawerInteractionContract: Story = {
  ...Drawer,
  play: async ({ args, canvasElement }) => {
    await playInlineUtility({ args, canvasElement });
  },
};

export const ProfileUnavailable: Story = {
  args: { currentDestination: 'profile', profileAvailable: false },
  play: async ({ canvasElement }) => {
    const navigation = getNavigation(canvasElement);
    const profileButton = getButton(navigation, 'profile');

    expect(profileButton).toBeDisabled();
    expect(profileButton).toHaveAttribute('aria-disabled', 'true');
    expect(profileButton).not.toHaveAttribute('aria-current', 'page');
  },
};

export const ProfileUnavailableContract: Story = {
  ...ProfileUnavailable,
  play: async ({ args, canvasElement }) => {
    args.onNavigate.mockClear();
    const navigation = getNavigation(canvasElement);
    const profileButton = getButton(navigation, 'profile');

    expect(profileButton).toBeDisabled();
    expect(profileButton).toHaveAttribute('aria-disabled', 'true');
    expect(profileButton).not.toHaveAttribute('aria-current', 'page');
    profileButton.click();
    expect(args.onNavigate).not.toHaveBeenCalled();
  },
};

export const Dark: Story = {
  args: { currentDestination: 'notifications' },
  globals: {
    backgrounds: { value: 'kosmoDark' },
    theme: 'dark',
  },
  play: async ({ canvasElement }) => {
    const navigation = getNavigation(canvasElement);
    const notifications = getButton(navigation, 'notifications');
    expect(notifications).toHaveAttribute('aria-current', 'page');
    expect(notifications).toBeVisible();
  },
};

export const PresentationTransitionContract: Story = {
  render: (args) => (
    <SidebarNavigationTransitionFixture
      onLogout={args.onLogout}
      onMenuOpenChange={args.onMenuOpenChange}
      onNavigate={args.onNavigate}
    />
  ),
  play: async ({ args, canvasElement, step }) => {
    const onMenuOpenChange = mocked(args.onMenuOpenChange!);
    onMenuOpenChange.mockClear();
    const canvas = within(canvasElement);

    await step('열린 full utility는 compact 전환에서 닫힘', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '설정 및 기타' }));
      expect(onMenuOpenChange).toHaveBeenLastCalledWith(true);
      expect(canvas.getByRole('button', { name: labels.settings })).toBeVisible();

      await userEvent.click(canvas.getByRole('button', { name: 'compact로 전환' }));
      await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(false));
      expect(canvas.queryByRole('button', { name: labels.settings })).not.toBeInTheDocument();

      await userEvent.click(canvas.getByRole('button', { name: 'full로 전환' }));
      expect(canvas.queryByRole('button', { name: labels.settings })).not.toBeInTheDocument();
    });

    await step('열린 compact ActionMenu는 full 전환에서 닫힘', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'compact로 전환' }));
      await userEvent.click(canvas.getByRole('button', { name: '설정 및 기타' }));
      await screen.findByRole('menu', { name: '설정 및 기타 메뉴' });
      expect(onMenuOpenChange).toHaveBeenLastCalledWith(true);

      await userEvent.click(canvas.getByRole('button', { name: 'full로 전환' }));
      await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(false));
      expect(screen.queryByRole('menu', { name: '설정 및 기타 메뉴' })).not.toBeInTheDocument();
      expect(canvas.queryByRole('button', { name: labels.settings })).not.toBeInTheDocument();
    });
  },
};
