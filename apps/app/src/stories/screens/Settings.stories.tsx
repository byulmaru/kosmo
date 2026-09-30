import { View } from 'react-native';
import { expect, spyOn, userEvent, within } from 'storybook/test';
import SettingsRoute from '@/app/(tabs)/(protected)/settings';
import { SettingsRouteLayout } from '@/app/(tabs)/(protected)/settings/_layout';
import SettingsProfileMigrationRoute from '@/app/(tabs)/(protected)/settings/profile-migration';
import SettingsThemeRoute from '@/app/(tabs)/(protected)/settings/theme';
import { BYULMARU_ID_ACCOUNT_SETTINGS_URL } from '@/components/settings/ByulmaruIdAccountSettingsEntry';
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
const ownerProfile = { ...selectedProfile, migrationSource: null };
const ownerData = {
  currentSession: {
    id: 'settings-session',
    selectedProfile: ownerProfile,
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
  const card = within(canvasElement).getByTestId('profile-migration-source-control');
  const content = card.parentElement;
  if (!content) {
    throw new Error('Profile migration content wrapper is missing.');
  }
  const route = content.parentElement;
  const pane = route?.parentElement;
  if (!route || !pane) {
    throw new Error('Profile migration route content or Settings pane is missing.');
  }

  const cardBounds = card.getBoundingClientRect();
  const contentBounds = content.getBoundingClientRect();
  const paneBounds = pane.getBoundingClientRect();

  expect(Math.abs(cardBounds.left - paneBounds.left - spacing.lg)).toBeLessThanOrEqual(1);
  expect(Math.abs(paneBounds.right - cardBounds.right - spacing.lg)).toBeLessThanOrEqual(1);
  expect(Math.abs(cardBounds.top - contentBounds.top - spacing.lg)).toBeLessThanOrEqual(1);
}

const meta = {
  component: SettingsRouteLayout,
  decorators: [
    (Story) => (
      <View style={{ maxWidth: 950, minHeight: '100%', width: '100%' }}>
        <Story />
      </View>
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
    expect(account).toHaveAttribute('href', BYULMARU_ID_ACCOUNT_SETTINGS_URL);
    expect(profileEntry).toHaveAttribute('href', '/settings/profile');
    expect(profileEntry).toHaveStyle({
      backgroundColor: colors.light.selectedSurface,
      borderColor: colors.light.selectedBorder,
    });
    expect(profileEntry).not.toHaveAttribute('aria-current');
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
    expect(canvas.getByRole('link', { name: '다른 서비스에서 이전 설정 열기' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(canvas.getByRole('textbox', { name: '기존 계정 주소' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '기존 계정 등록' })).toBeDisabled();
    expect(
      canvas.getByRole('group', {
        name: '이전받을 Kosmo 프로필 현재 Profile @settings-owner@selected-profile.example',
      }),
    ).toBeVisible();
    expect(
      canvas.getByText(
        '기존 계정 주소를 먼저 등록한 뒤 기존 서비스에서 이 Kosmo 프로필로 Move를 시작하세요. 팔로워는 옮길 수 있지만 게시물은 복사되지 않아요.',
      ),
    ).toBeVisible();
    expectProfileMigrationContentGutter(canvasElement);
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
    expect(canvas.getByRole('textbox', { name: '기존 계정 주소' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '기존 계정 등록' })).toBeDisabled();
    expectProfileMigrationContentGutter(canvasElement);
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
