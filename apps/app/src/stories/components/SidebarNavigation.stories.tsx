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
  logoutError = null,
  logoutPending = false,
  onLogout,
  onMenuOpenChange,
  onNavigate,
  presentation = 'full',
  profileAvailable,
  showFeedback = true,
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
        logoutError={logoutError}
        logoutPending={logoutPending}
        onLogout={onLogout}
        onMenuOpenChange={onMenuOpenChange}
        onNavigate={(nextDestination) => {
          onNavigate(nextDestination);
          setDestination(nextDestination);
        }}
        presentation={presentation}
        profile={profileAvailable ? profile : null}
        showFeedback={showFeedback}
        unreadNotificationCount={unreadNotificationCount}
      />
    </View>
  );
}

function SidebarNavigationLogoutLifecycleFixture({
  presentation,
}: {
  presentation: SidebarPresentation;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <View>
      <Button
        onPress={() => {
          setPending(false);
          setError('로그아웃하지 못했어요.');
        }}
        title="로그아웃 실패 응답"
      />
      <View style={{ height: 720, width: presentation === 'compact' ? 80 : 320 }}>
        <SidebarNavigation
          currentDestination="home"
          logoutError={error}
          logoutPending={pending}
          onLogout={() => {
            setError(null);
            setPending(true);
          }}
          onNavigate={() => undefined}
          presentation={presentation}
          profile={profile}
        />
      </View>
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
    logoutError: null,
    logoutPending: false,
    onLogout: fn(),
    onMenuOpenChange: fn(),
    onNavigate: fn(),
    presentation: 'full',
    profileAvailable: true,
    showFeedback: true,
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
    'CompactLogoutPendingContract',
    'CompactLogoutLifecycleContract',
    'DrawerLogoutLifecycleContract',
    'FeedbackUnavailableContract',
    'LogoutErrorContract',
    'LogoutLifecycleContract',
    'LogoutPendingContract',
    'NarrowDrawerLayoutContract',
    'PresentationTransitionContract',
    'ProfileUnavailableContract',
    'ReducedMotionContract',
    'SettingsNavigationDisclosure',
    'SettingsNavigationDisclosureDrawer',
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
        ? presentation === 'compact'
          ? within(navigation).getByRole('button', { name: '설정 및 기타' })
          : within(navigation).getByRole('button', { name: labels.settings })
        : getButton(navigation, currentDestination);
    expect(selected).toHaveAttribute('aria-current', 'page');
    expect(currentControls).toHaveLength(1);
  } else {
    expect(currentControls).toHaveLength(0);
  }
  expectRect(home, presentation === 'compact' ? 44 : 272, presentation === 'compact' ? 44 : 45);

  if (profileAvailable) {
    const profileAvatar = getButton(navigation, 'profile').querySelector<HTMLElement>(
      '[aria-label="사샤 프로필 이미지"]',
    );
    expect(profileAvatar).not.toBeNull();
    expectRect(profileAvatar!, 28, 28);
  }

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

export const Playground: Story = {
  args: { unreadNotificationCount: 3 },
  parameters: {
    controls: {
      disable: false,
      include: [
        'currentDestination',
        'logoutError',
        'logoutPending',
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
      expect(
        within(utility).getByTestId('sidebar-control-visual').querySelectorAll('svg'),
      ).toHaveLength(1);
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
      expect(onMenuOpenChange).toHaveBeenLastCalledWith(true);
      expect(logoutMenu).toBeVisible();
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
  const footer = feedback.parentElement;
  const utilityVisual = within(utility).getByTestId('sidebar-control-visual');
  const utilityIcons = utilityVisual.querySelectorAll('svg');
  const utilityIconRect = utilityIcons[0].getBoundingClientRect();
  const utilityVisualRect = utilityVisual.getBoundingClientRect();
  const utilityLabel = within(utility).getByText('설정 및 기타');

  await expectNavigationBasics(
    canvasElement,
    'drawer',
    args.currentDestination ?? null,
    args.profileAvailable,
    args.unreadNotificationCount,
  );

  expectRect(navigation, 320, 720);
  expect(home.getBoundingClientRect().top - navigation.getBoundingClientRect().top).toBe(24);
  expectRect(home, 272, 45);
  expectRect(utility, 272, 45);
  expectRect(feedback, 272, 45);
  expect(footer).not.toBeNull();
  expectRect(footer!, 272, 94);
  expect(feedback.getBoundingClientRect().top - footer!.getBoundingClientRect().top).toBe(4);
  expect(utility.getBoundingClientRect().top - footer!.getBoundingClientRect().top).toBe(49);
  expect(feedback.closest('[role="menu"]')).toBeNull();
  expect(utility).toHaveAttribute('aria-expanded', 'false');
  expect(utilityIcons).toHaveLength(2);
  expect(utilityIcons[0]).toHaveAttribute('width', '20');
  expect(utilityIcons[0]).toHaveAttribute('height', '20');
  expect(utilityIconRect.left - utilityVisualRect.left).toBe(8);
  expect(utilityLabel.getBoundingClientRect().left - utilityVisualRect.left).toBe(44);
  expect(utilityIcons[1].querySelector('path')).toHaveAttribute('d', 'm6 9 6 6 6-6');
  expect(utilityIcons[1].getBoundingClientRect().left - utilityVisualRect.left).toBe(224);
  expect(utilityVisualRect.right - utilityIcons[1].getBoundingClientRect().right).toBe(24);

  await userEvent.click(utility);
  expect(onMenuOpenChange).toHaveBeenLastCalledWith(true);
  const settings = within(navigation).getByRole('button', { name: labels.settings });
  const logout = within(navigation).getByRole('button', { name: '로그아웃' });
  expect(settings).toBeVisible();
  expect(logout).toBeVisible();
  expectRect(settings, 272, 45);
  expectRect(logout, 272, 45);
  expect(settings.getBoundingClientRect().top).toBe(utility.getBoundingClientRect().bottom);
  expect(logout.getBoundingClientRect().top).toBe(settings.getBoundingClientRect().bottom);
  expect(feedback.closest('[role="menu"]')).toBeNull();
  expect(utility).toHaveAttribute('aria-expanded', 'true');
  expect(utilityVisual.querySelectorAll('svg')).toHaveLength(2);
  expect(utilityVisual.querySelectorAll('svg')[1].querySelector('path')).toHaveAttribute(
    'd',
    'm18 15-6-6-6 6',
  );

  for (const control of [settings, logout]) {
    const visual = within(control).getByTestId('sidebar-control-visual');
    const icon = visual.querySelector('svg');
    const label = within(control).getByText(control === settings ? labels.settings : '로그아웃');
    expect(icon).not.toBeNull();
    expect(icon!.getBoundingClientRect().left - visual.getBoundingClientRect().left).toBeCloseTo(
      32,
      0,
    );
    expect(label.getBoundingClientRect().left - visual.getBoundingClientRect().left).toBeCloseTo(
      68,
      0,
    );
  }

  await userEvent.click(settings);
  expect(onNavigate).toHaveBeenLastCalledWith('settings');
  await waitFor(() => expect(onMenuOpenChange).toHaveBeenLastCalledWith(false));
  expect(within(navigation).getByRole('button', { name: labels.settings })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(within(navigation).getByRole('button', { name: '로그아웃' })).toBeVisible();

  await userEvent.click(home);
  expect(onNavigate).toHaveBeenLastCalledWith('home');
  await waitFor(() => expect(utility).toHaveAttribute('aria-expanded', 'false'));
  expect(within(navigation).queryByRole('button', { name: labels.settings })).toBeNull();
  expect(within(navigation).queryByRole('button', { name: '로그아웃' })).toBeNull();
}

export const SettingsNavigationDisclosure: Story = {
  args: { currentDestination: 'settings', presentation: 'full' },
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const navigation = getNavigation(canvasElement);
    const utility = within(navigation).getByRole('button', { name: '설정 및 기타' });
    const settings = within(navigation).getByRole('button', { name: labels.settings });

    expect(utility).toHaveAttribute('aria-expanded', 'true');
    expect(utility).not.toHaveAttribute('aria-current');
    expect(settings).toHaveAttribute('aria-current', 'page');
    expect(settings).toBeVisible();

    await userEvent.click(within(navigation).getByRole('button', { name: labels.home }));
    await waitFor(() => expect(utility).toHaveAttribute('aria-expanded', 'false'));
    expect(within(navigation).queryByRole('button', { name: labels.settings })).toBeNull();
    expect(within(navigation).getByRole('button', { name: labels.home })).toHaveAttribute(
      'aria-current',
      'page',
    );
  },
};

export const SettingsNavigationDisclosureDrawer: Story = {
  ...SettingsNavigationDisclosure,
  args: { currentDestination: 'settings', presentation: 'drawer' },
};

export const Drawer: Story = {
  args: { presentation: 'drawer', unreadNotificationCount: 10 },
};

export const DrawerInteractionContract: Story = {
  ...Drawer,
  play: async ({ args, canvasElement }) => {
    await playInlineUtility({ args, canvasElement });
  },
};

export const NarrowDrawerLayoutContract: Story = {
  render: (args) => (
    <View style={{ height: 720, width: 272 }}>
      <SidebarNavigation
        currentDestination="home"
        onLogout={args.onLogout}
        onNavigate={args.onNavigate}
        presentation="drawer"
        profile={profile}
      />
    </View>
  ),
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const navigation = getNavigation(canvasElement);

    expectRect(navigation, 272, 720);
    expectRect(getButton(navigation, 'home'), 224, 45);
    expectRect(getButton(navigation, 'feedback'), 224, 45);
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

export const FeedbackUnavailableContract: Story = {
  args: { showFeedback: false },
  play: async ({ args, canvasElement }) => {
    args.onNavigate.mockClear();
    const navigation = getNavigation(canvasElement);
    expect(within(navigation).queryByRole('button', { name: '피드백 보내기' })).toBeNull();
    expect(within(navigation).getByRole('button', { name: '설정 및 기타' })).toBeVisible();
    expect(args.onNavigate).not.toHaveBeenCalledWith('feedback');
  },
};

export const LogoutPendingContract: Story = {
  args: { logoutPending: true },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    args.onLogout.mockClear();
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '설정 및 기타' }));
    const logout = canvas.getByRole('button', { name: '로그아웃' });
    expect(logout).toHaveAttribute('aria-disabled', 'true');
    expect(logout).toHaveAttribute('tabindex', '-1');
    expect(logout).toHaveAttribute('aria-busy', 'true');
    expect(within(logout).getByLabelText('로그아웃 처리 중')).toBeVisible();
    logout.click();
    expect(args.onLogout).not.toHaveBeenCalled();
  },
};

export const CompactLogoutPendingContract: Story = {
  render: () => <SidebarNavigationLogoutLifecycleFixture presentation="compact" />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '설정 및 기타' }));
    const menu = screen.getByRole('menu', { name: '설정 및 기타 메뉴' });
    const logout = within(menu).getByRole('menuitem', { name: '로그아웃' });
    await userEvent.click(logout);
    await waitFor(() => expect(logout).toHaveAttribute('aria-busy', 'true'));
    expect(logout).toHaveAttribute('aria-disabled', 'true');
    expect(logout).toHaveAttribute('tabindex', '-1');
    expect(logout.querySelector('svg')).not.toBeNull();
  },
};

export const LogoutErrorContract: Story = {
  args: { logoutError: '로그아웃하지 못했어요.' },
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('alert')).toHaveTextContent('로그아웃하지 못했어요.');

    await userEvent.click(canvas.getByRole('button', { name: '설정 및 기타' }));
    expect(canvas.getByRole('button', { name: '로그아웃' })).toBeEnabled();
  },
};

async function playLogoutLifecycle(canvasElement: HTMLElement, compact: boolean) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: '설정 및 기타' }));
  const getLogout = () =>
    compact
      ? within(screen.getByRole('menu', { name: '설정 및 기타 메뉴' })).getByRole('menuitem', {
          name: '로그아웃',
        })
      : canvas.getByRole('button', { name: '로그아웃' });

  await userEvent.click(getLogout());
  await waitFor(() => expect(getLogout()).toHaveAttribute('aria-busy', 'true'));
  if (compact) {
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('menu', { name: '설정 및 기타 메뉴' })).toBeVisible();
  }

  canvas.getByRole('button', { name: '로그아웃 실패 응답' }).click();
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('로그아웃하지 못했어요.'),
  );
  expect(getLogout()).toBeEnabled();

  await userEvent.click(getLogout());
  await waitFor(() => expect(getLogout()).toHaveAttribute('aria-busy', 'true'));
}

export const LogoutLifecycleContract: Story = {
  render: () => <SidebarNavigationLogoutLifecycleFixture presentation="full" />,
  play: async ({ canvasElement }) => playLogoutLifecycle(canvasElement, false),
};

export const DrawerLogoutLifecycleContract: Story = {
  render: () => <SidebarNavigationLogoutLifecycleFixture presentation="drawer" />,
  play: async ({ canvasElement }) => playLogoutLifecycle(canvasElement, false),
};

export const CompactLogoutLifecycleContract: Story = {
  render: () => <SidebarNavigationLogoutLifecycleFixture presentation="compact" />,
  play: async ({ canvasElement }) => playLogoutLifecycle(canvasElement, true),
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
