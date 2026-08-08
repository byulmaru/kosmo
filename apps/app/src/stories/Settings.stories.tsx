import { View } from 'react-native';
import { expect, spyOn, userEvent, within } from 'storybook/test';
import SettingsRoute from '@/app/(tabs)/(protected)/settings';
import { SettingsRouteLayout } from '@/app/(tabs)/(protected)/settings/_layout';
import { BYULMARU_ID_ACCOUNT_SETTINGS_URL } from '@/components/settings/ByulmaruIdAccountSettingsEntry';
import { SettingsProfileDetail } from '@/components/settings/SettingsProfileDetail';
import { profile } from './fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const selectedProfile = profile({
  displayName: '현재 Profile',
  id: 'settings-profile-owner',
  relativeHandle: '@settings-owner',
  viewerState: {
    follow: null,
    followRequest: null,
    isSelf: true,
    membership: { role: 'OWNER' },
  },
});
const ownerData = {
  currentSession: { id: 'settings-session', selectedProfile },
};

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
    relay: { data: ownerData },
    router: { pathname: '/settings' },
  },
  render: () => (
    <SettingsRouteLayout>
      <SettingsRoute />
    </SettingsRouteLayout>
  ),
  title: 'KOSMO/Settings/Page',
} satisfies Meta<typeof SettingsRouteLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullMasterDetail: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const navigation = canvas.getByRole('navigation', { name: '설정 목록' });
    const account = within(navigation).getByRole('link', {
      name: 'Byulmaru ID Account Settings 외부 서비스로 이동',
    });
    const profileEntry = within(navigation).getByRole('link', {
      name: '게시물 기본 공개 범위 설정 열기',
    });

    expect(canvas.getByRole('heading', { name: '설정' })).toBeVisible();
    expect(canvas.getByRole('heading', { name: '게시물 기본 공개 범위' })).toBeVisible();
    expect(account).toHaveAttribute('href', BYULMARU_ID_ACCOUNT_SETTINGS_URL);
    expect(profileEntry).toHaveAttribute('href', '/settings/default-post-visibility');
    expect(profileEntry).toHaveAttribute('aria-current', 'page');
    expect(
      canvas.getByRole('radiogroup', {
        name: 'Kosmo 내부 Profile 현재 Profile @settings-owner 기본 게시 공개 범위',
      }),
    ).toBeVisible();
    expect(canvasElement.querySelectorAll('[role="navigation"]')).toHaveLength(1);
  },
};

export const CompactRootFirst: Story = {
  beforeEach: () => {
    const visualViewport = window.visualViewport;

    if (!visualViewport) {
      throw new Error('Settings compact story requires visualViewport.');
    }

    const originalWidthDescriptor = Object.getOwnPropertyDescriptor(visualViewport, 'width');
    Object.defineProperty(visualViewport, 'width', { configurable: true, value: 900 });
    visualViewport.dispatchEvent(new Event('resize'));

    return () => {
      if (originalWidthDescriptor) {
        Object.defineProperty(visualViewport, 'width', originalWidthDescriptor);
      } else {
        delete (visualViewport as { width?: number }).width;
      }
      visualViewport.dispatchEvent(new Event('resize'));
    };
  },
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: '설정' })).toBeVisible();
    expect(canvas.getByRole('navigation', { name: '설정 목록' })).toBeVisible();
    expect(canvas.queryByRole('radiogroup')).toBeNull();
    expect(
      canvas.getByRole('link', { name: '게시물 기본 공개 범위 설정 열기' }),
    ).not.toHaveAttribute('aria-current');
  },
};

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
    expect(canvas.queryByRole('radiogroup')).toBeNull();
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
      canvas.findByRole('radiogroup', {
        name: 'Kosmo 내부 Profile 현재 Profile @settings-owner 기본 게시 공개 범위',
      }),
    ).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
  render: () => <SettingsProfileDetail />,
};
