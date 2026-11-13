import { View } from 'react-native';
import { expect, spyOn, userEvent, within } from 'storybook/test';
import SettingsRoute from '@/app/(tabs)/(protected)/settings';
import { SettingsRouteLayout } from '@/app/(tabs)/(protected)/settings/_layout';
import SettingsProfileMigrationRoute from '@/app/(tabs)/(protected)/settings/profile-migration';
import SettingsThemeRoute from '@/app/(tabs)/(protected)/settings/theme';
import { WebPushPermissionContext } from '@/components/native-push/webPushPermissionContext';
import { SettingsProfileDetail } from '@/components/settings/SettingsProfileDetail';
import { ThemePreferenceProvider } from '@/theme/ThemePreferenceProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, spacing } from '@/theme/tokens';
import { profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RequestParameters, Variables } from 'relay-runtime';

const selectedProfile = profile({
  displayName: '현재 Profile',
  handle: 'settings-owner',
  id: 'settings-profile-owner',
  instance: { canonicalOrigin: 'https://selected-profile.example', kind: 'LOCAL' },
  relativeHandle: '@settings-owner',
  viewerState: {
    follow: null,
    followRequest: null,
    isSelf: true,
    membership: { role: 'OWNER' },
  },
});
const ownerProfile = { ...selectedProfile, hasMigrationSource: false, migrationSource: null };
const ownerData = {
  currentSession: {
    id: 'settings-session',
    selectedProfile: ownerProfile,
  },
};
const preparedOwnerProfile = {
  ...ownerProfile,
  hasMigrationSource: true,
  migrationSource: {
    __typename: 'Profile' as const,
    displayName: '원격 원본 Profile',
    id: 'settings-profile-migration-source',
    relativeHandle: '@source@remote.example',
  },
};
const preparedOwnerData = {
  currentSession: {
    id: 'settings-session-prepared',
    selectedProfile: preparedOwnerProfile,
  },
};
const settingsMutationResponse = {
  updateProfile: {
    profile: {
      followPolicy: selectedProfile.followPolicy,
      id: selectedProfile.id,
      private: {
        defaultPostVisibility: selectedProfile.private?.defaultPostVisibility ?? 'UNLISTED',
      },
    },
  },
};

function resetSettingsMutationResponse() {
  settingsMutationResponse.updateProfile.profile.followPolicy = selectedProfile.followPolicy;
  settingsMutationResponse.updateProfile.profile.private = {
    defaultPostVisibility: selectedProfile.private?.defaultPostVisibility ?? 'UNLISTED',
  };
}

function observeSettingsMutation(_request: RequestParameters, variables: Variables) {
  const input = variables.input as {
    defaultPostVisibility?: 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED';
    followPolicy?: 'APPROVAL_REQUIRED' | 'OPEN';
  };
  if (input.defaultPostVisibility !== undefined) {
    settingsMutationResponse.updateProfile.profile.private = {
      defaultPostVisibility: input.defaultPostVisibility,
    };
  }
  if (input.followPolicy !== undefined) {
    settingsMutationResponse.updateProfile.profile.followPolicy = input.followPolicy;
  }
}

function setVisualViewportWidth(width: number, storyName: string) {
  const visualViewport = window.visualViewport;

  if (!visualViewport) {
    throw new Error(`${storyName} requires visualViewport.`);
  }

  const originalWidthDescriptor = Object.getOwnPropertyDescriptor(visualViewport, 'width');
  Object.defineProperty(visualViewport, 'width', { configurable: true, value: width });
  visualViewport.dispatchEvent(new Event('resize'));

  return () => {
    if (originalWidthDescriptor) {
      Object.defineProperty(visualViewport, 'width', originalWidthDescriptor);
    } else {
      delete (visualViewport as { width?: number }).width;
    }
    visualViewport.dispatchEvent(new Event('resize'));
  };
}

function expectProfileMigrationContentGutter(canvasElement: HTMLElement) {
  const control = within(canvasElement).getByTestId('profile-migration-source-control');
  const content = control.parentElement;
  if (!content) {
    throw new Error('Profile migration content wrapper is missing.');
  }

  const controlBounds = control.getBoundingClientRect();
  const contentBounds = content.getBoundingClientRect();

  expect(Math.abs(controlBounds.left - contentBounds.left - spacing.lg)).toBeLessThanOrEqual(1);
  expect(Math.abs(contentBounds.right - controlBounds.right - spacing.lg)).toBeLessThanOrEqual(1);
  expect(Math.abs(controlBounds.top - contentBounds.top - spacing.lg)).toBeLessThanOrEqual(1);
}

function expectProfileMigrationControlLayout(
  canvasElement: HTMLElement,
  direction: 'horizontal' | 'vertical',
) {
  const canvas = within(canvasElement);
  const control = canvas.getByTestId('profile-migration-source-control');
  const contentBounds = control.parentElement?.getBoundingClientRect();
  if (!contentBounds) {
    throw new Error('Profile migration content wrapper is missing.');
  }

  const pairs = [
    [
      canvas.getByRole('textbox', { name: '기존 계정 주소' }),
      canvas.getByRole('button', { name: '기존 계정 등록' }),
    ],
    [
      canvas.getByRole('button', { name: '팔로잉 CSV 파일 선택' }),
      canvas.getByRole('button', { name: '팔로잉 가져오기' }),
    ],
  ];

  for (const [field, action] of pairs) {
    const fieldBounds = field.getBoundingClientRect();
    const actionBounds = action.getBoundingClientRect();
    expect(fieldBounds.width).toBeGreaterThan(0);
    expect(actionBounds.width).toBeGreaterThan(0);
    expect(fieldBounds.right).toBeLessThanOrEqual(contentBounds.right + 1);
    expect(actionBounds.right).toBeLessThanOrEqual(contentBounds.right + 1);

    if (direction === 'horizontal') {
      expect(Math.abs(fieldBounds.top - actionBounds.top)).toBeLessThanOrEqual(1);
      expect(actionBounds.left).toBeGreaterThanOrEqual(fieldBounds.right);
    } else {
      expect(actionBounds.top).toBeGreaterThanOrEqual(fieldBounds.bottom);
      expect(Math.abs(fieldBounds.left - actionBounds.left)).toBeLessThanOrEqual(1);
    }
  }
}

const meta = {
  component: SettingsRouteLayout,
  decorators: [
    (Story) => (
      <WebPushPermissionContext.Provider
        value={{
          permission: 'default',
          support: 'supported',
          requestPermission: async () => undefined,
        }}
      >
        <View style={{ maxWidth: 950, minHeight: '100%', width: '100%' }}>
          <Story />
        </View>
      </WebPushPermissionContext.Provider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    relay: {
      data: ownerData,
      mutationRequestObserver: observeSettingsMutation,
      mutationResponse: settingsMutationResponse,
    },
    router: { pathname: '/settings' },
  },
  render: () => (
    <SettingsRouteLayout>
      <SettingsRoute />
    </SettingsRouteLayout>
  ),
  title: 'KOSMO/Screens/Settings',
} satisfies Meta<typeof SettingsRouteLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullMasterDetail: Story = {
  beforeEach: resetSettingsMutationResponse,
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const navigation = canvas.getByRole('navigation', { name: '설정 목록' });
    const account = within(navigation).getByRole('link', {
      name: 'Byulmaru ID Account Settings 외부 서비스로 이동',
    });
    const profileEntry = within(navigation).getByRole('link', {
      name: '프로필 설정 열기',
    });
    const migrationEntry = within(navigation).getByRole('link', {
      name: '다른 서비스에서 이전 설정 열기',
    });

    expect(canvas.getByRole('heading', { name: /^설정$/ })).toBeVisible();
    expect(canvas.getByRole('heading', { name: /^프로필 설정$/ })).toBeVisible();
    expect(migrationEntry).toHaveAttribute('href', '/settings/profile-migration');
    expect(canvas.queryByTestId('profile-migration-source-control')).toBeNull();
    expect(account).toHaveAttribute('href', 'https://id.byulmaru.co');
    expect(account).toHaveAttribute('target', '_blank');
    expect(account).toHaveAttribute('rel', 'noopener noreferrer');
    expect(profileEntry).toHaveAttribute('href', '/settings/profile');
    expect(profileEntry.firstElementChild).toHaveStyle({
      backgroundColor: colors.light.selectedSurface,
      borderColor: colors.light.selectedBorder,
      borderWidth: '1px',
    });
    expect(profileEntry).not.toHaveAttribute('aria-current');
    expect(canvas.getByRole('button', { name: '브라우저 알림 켜기' })).toBeVisible();
    expect(canvas.getByRole('combobox', { name: '게시물 기본 공개 범위' })).toBeVisible();
    expect(canvasElement.querySelectorAll('[role="navigation"]')).toHaveLength(1);
  },
};

export const CompactRootFirst: Story = {
  beforeEach: () => setVisualViewportWidth(900, 'Settings compact story'),
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: /^설정$/ })).toBeVisible();
    expect(canvas.getByRole('navigation', { name: '설정 목록' })).toBeVisible();
    expect(canvas.queryByRole('radiogroup')).toBeNull();
    expect(canvas.getByRole('link', { name: '프로필 설정 열기' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(canvas.getByRole('link', { name: '다른 서비스에서 이전 설정 열기' })).toHaveAttribute(
      'href',
      '/settings/profile-migration',
    );
  },
};

export const ThemeDetail: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    controls: { disable: true },
    router: { pathname: '/settings/theme' },
  },
  render: () => (
    <ThemePreferenceProvider>
      <ThemeStoryCanvas />
    </ThemePreferenceProvider>
  ),
};

export const ProfileMigrationFullWeb: Story = {
  beforeEach: () => setVisualViewportWidth(1400, 'Profile migration full Web story'),
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    controls: { disable: true },
    relay: { data: ownerData },
    router: { pathname: '/settings/profile-migration' },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: '설정' })).toBeVisible();
    expect(canvas.getByRole('heading', { name: '다른 서비스에서 이전' })).toBeVisible();
    const accountHeading = canvas.getByRole('heading', { name: '계정 이전' });
    const followingHeading = canvas.getByRole('heading', { name: '팔로잉 가져오기' });
    expect(accountHeading).toBeVisible();
    expect(followingHeading).toBeVisible();
    const accountSection = accountHeading.parentElement;
    if (!accountSection) {
      throw new Error('Profile migration account section is missing.');
    }
    expect(Number.parseFloat(getComputedStyle(accountSection).borderBottomWidth)).toBeGreaterThan(
      0,
    );
    expect(accountSection.getBoundingClientRect().bottom).toBeLessThan(
      followingHeading.getBoundingClientRect().top,
    );
    const navigation = canvas.getByRole('navigation', { name: '설정 목록' });
    expect(
      within(navigation).getAllByRole('link', { name: '다른 서비스에서 이전 설정 열기' }),
    ).toHaveLength(1);
    expect(
      within(navigation).queryByRole('link', { name: '팔로잉 가져오기 설정 열기' }),
    ).toBeNull();
    expect(canvas.getByRole('link', { name: '다른 서비스에서 이전 설정 열기' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(canvas.getByRole('textbox', { name: '기존 계정 주소' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '기존 계정 등록' })).toBeDisabled();
    expect(canvas.queryByRole('button', { name: '기존 계정 등록 해제' })).toBeNull();
    expect(canvas.getByRole('button', { name: '팔로잉 CSV 파일 선택' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '팔로잉 가져오기' })).toBeDisabled();
    expectProfileMigrationContentGutter(canvasElement);
    expectProfileMigrationControlLayout(canvasElement, 'horizontal');
  },
  render: () => (
    <SettingsRouteLayout>
      <SettingsProfileMigrationRoute />
    </SettingsRouteLayout>
  ),
};

export const ProfileMigrationMobileWeb: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    controls: { disable: true },
    relay: { data: ownerData },
    router: { pathname: '/settings/profile-migration' },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('profile-migration-source-control')).toBeVisible();
    expect(canvas.getByRole('heading', { name: '계정 이전' })).toBeVisible();
    expect(canvas.getByRole('heading', { name: '팔로잉 가져오기' })).toBeVisible();
    expect(canvas.getByRole('textbox', { name: '기존 계정 주소' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '기존 계정 등록' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '팔로잉 CSV 파일 선택' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '팔로잉 가져오기' })).toBeDisabled();
    expectProfileMigrationContentGutter(canvasElement);
    expectProfileMigrationControlLayout(canvasElement, 'vertical');
  },
  render: () => (
    <SettingsRouteLayout>
      <SettingsProfileMigrationRoute />
    </SettingsRouteLayout>
  ),
};

export const ProfileMigrationPreparedFullWeb: Story = {
  beforeEach: () => setVisualViewportWidth(1400, 'Prepared profile migration full Web story'),
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    controls: { disable: true },
    relay: { data: preparedOwnerData },
    router: { pathname: '/settings/profile-migration' },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('button', { name: '기존 계정 등록 해제' })).toBeVisible();
    expect(canvas.queryByRole('textbox', { name: '기존 계정 주소' })).toBeNull();
    expect(canvas.queryByRole('button', { name: '기존 계정 등록' })).toBeNull();
    expect(canvas.queryByRole('alertdialog')).toBeNull();
  },
  render: () => (
    <SettingsRouteLayout>
      <SettingsProfileMigrationRoute />
    </SettingsRouteLayout>
  ),
};

export const ProfileMigrationPreparedMobileWeb: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    controls: { disable: true },
    relay: { data: preparedOwnerData },
    router: { pathname: '/settings/profile-migration' },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('profile-migration-source-control')).toBeVisible();
    expect(canvas.getByRole('button', { name: '기존 계정 등록 해제' })).toBeVisible();
    expect(canvas.queryByRole('textbox', { name: '기존 계정 주소' })).toBeNull();
  },
  render: () => (
    <SettingsRouteLayout>
      <SettingsProfileMigrationRoute />
    </SettingsRouteLayout>
  ),
};

function ThemeStoryCanvas() {
  const theme = useTheme();

  return (
    <View style={{ backgroundColor: theme.backgroundCanvas, flex: 1, minHeight: '100%' }}>
      <SettingsRouteLayout>
        <SettingsThemeRoute />
      </SettingsRouteLayout>
    </View>
  );
}

export const NoSelectedProfile: Story = {
  parameters: {
    relay: {
      data: {
        currentSession: { id: 'settings-session-without-profile', selectedProfile: null },
      },
    },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('설정할 Profile이 없어요')).toBeVisible();
    expect(canvas.queryByRole('combobox')).toBeNull();
  },
  render: () => <SettingsProfileDetail />,
};

export const ProfileLoading: Story = {
  parameters: {
    relay: {
      operationResponses: {
        SettingsProfileDetailQuery: { data: ownerData, delayMs: 60_000 },
      },
    },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByRole('progressbar', { name: 'Profile 설정을 불러오는 중입니다.' }),
    ).toBeVisible();
  },
  render: () => <SettingsProfileDetail />,
};

export const ProfileErrorRetry: Story = {
  beforeEach: () => {
    const originalError = console.error;
    const errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (!args.some((argument) => String(argument).includes('Profile 설정 조회 실패'))) {
        originalError(...args);
      }
    });

    return () => errorSpy.mockRestore();
  },
  parameters: {
    relay: {
      operationResponses: {
        SettingsProfileDetailQuery: {
          sequence: [{ error: 'Profile 설정 조회 실패' }, { data: ownerData }],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      'Profile 설정을 불러오지 못했어요',
    );
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(
      canvas.findByRole('combobox', { name: '게시물 기본 공개 범위' }),
    ).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
  render: () => <SettingsProfileDetail />,
};
