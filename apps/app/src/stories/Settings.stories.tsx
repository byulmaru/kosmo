import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ShellChromeProvider } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

const openProfileSwitcher = fn();

const meta = {
  component: SettingsPage,
  decorators: [
    (Story) => (
      <ShellChromeProvider openProfileSwitcher={openProfileSwitcher}>
        <Story />
      </ShellChromeProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  title: 'KOSMO/Settings/Page Shell',
} satisfies Meta<typeof SettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectedProfile: Story = {
  args: {
    accountContent: <AccountEntryFixture />,
    profileState: {
      content: <ProfileSettingsFixture />,
      displayName: '우주 기록자',
      relativeHandle: '@space-writer',
      status: 'selected',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getAllByRole('heading', { name: '설정' })).toHaveLength(1);
    expect(canvas.getByRole('heading', { name: '계정 설정' })).toBeVisible();
    expect(canvas.getByText('Byulmaru ID 외부 서비스')).toBeVisible();
    expect(
      canvas.getByRole('link', { name: 'Byulmaru ID 계정 설정 열기, 외부 서비스' }),
    ).toBeVisible();
    expect(canvas.getByRole('heading', { name: '프로필 설정' })).toBeVisible();
    expect(canvas.getByText('Kosmo 내부 기능')).toBeVisible();
    expect(
      canvas.getByLabelText('현재 프로필 설정 대상: 우주 기록자, @space-writer'),
    ).toBeVisible();
  },
};

export const NoSelectedProfile: Story = {
  args: {
    accountContent: <AccountEntryFixture />,
    profileState: {
      actionLabel: '프로필 선택',
      status: 'empty',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByRole('link', { name: 'Byulmaru ID 계정 설정 열기, 외부 서비스' }),
    ).toBeVisible();
    const selectProfile = canvas.getByRole('button', { name: '프로필 선택' });
    expect(selectProfile).toBeVisible();
    await userEvent.click(selectProfile);
    expect(openProfileSwitcher).toHaveBeenCalledTimes(1);
  },
};

export const NoProfiles: Story = {
  args: {
    accountContent: <AccountEntryFixture />,
    profileState: {
      actionLabel: '프로필 만들기',
      status: 'empty',
    },
  },
};

export const ProfileLoading: Story = {
  args: {
    accountContent: <AccountEntryFixture />,
    profileState: { status: 'loading' },
  },
};

export const ProfileError: Story = {
  args: {
    accountContent: <AccountEntryFixture />,
    profileState: { onRetry: fn(), status: 'error' },
  },
};

export const RouteLoading: Story = {
  args: {
    accountContent: <AccountEntryFixture />,
    profileState: { status: 'loading' },
    routeState: { status: 'loading' },
  },
};

export const RouteError: Story = {
  args: {
    accountContent: <AccountEntryFixture />,
    profileState: { status: 'loading' },
    routeState: { onRetry: fn(), status: 'error' },
  },
};

export const AccountNavigationError: Story = {
  args: {
    accountContent: (
      <StateView
        actionLabel="다시 시도"
        alert
        description="Byulmaru ID Account Settings를 열지 못했습니다."
        onAction={fn()}
        title="외부 서비스로 이동하지 못했어요"
      />
    ),
    profileState: {
      content: <ProfileSettingsFixture />,
      displayName: '우주 기록자',
      relativeHandle: '@space-writer',
      status: 'selected',
    },
  },
};

export const LongProfileIdentityOnSmallScreen: Story = {
  args: {
    accountContent: <AccountEntryFixture />,
    profileState: {
      content: <ProfileSettingsFixture />,
      displayName: '아주 긴 표시 이름을 사용하는 지역 우주 관측 기록 보관 프로필',
      relativeHandle: '@extremely-long-profile-handle-for-layout-verification',
      status: 'selected',
    },
  },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

function AccountEntryFixture() {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel="Byulmaru ID 계정 설정 열기, 외부 서비스"
      accessibilityRole="link"
      onPress={fn()}
      style={({ pressed }) => [
        styles.entry,
        { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.entryTitle, { color: theme.text }]}>Byulmaru ID에서 계정 설정</Text>
      <Text style={[styles.entryDescription, { color: theme.textSecondary }]}>
        외부 서비스로 이동
      </Text>
    </Pressable>
  );
}

function ProfileSettingsFixture() {
  const theme = useTheme();

  return (
    <View style={[styles.profileFixture, { borderColor: theme.border }]}>
      <Text style={[styles.entryTitle, { color: theme.text }]}>Profile 설정 통합 영역</Text>
      <Text style={[styles.entryDescription, { color: theme.textSecondary }]}>
        PROD-648 결과가 이 영역에 연결됩니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  entry: {
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: 48,
    padding: spacing.lg,
  },
  entryTitle: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  entryDescription: { fontFamily: 'SUIT', ...typography.sm },
  profileFixture: { borderRadius: radii.sm, borderWidth: 1, gap: spacing.xs, padding: spacing.lg },
});
