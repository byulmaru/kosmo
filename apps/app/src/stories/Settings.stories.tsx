import { ChevronRightIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ShellChromeProvider } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

const openProfileSwitcher = fn();

const meta = {
  component: SettingsPage,
  decorators: [
    (Story) => (
      <ShellChromeProvider openProfileSwitcher={openProfileSwitcher}>
        <SettingsStoryFrame>
          <Story />
        </SettingsStoryFrame>
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
    expect(canvas.getByRole('heading', { level: 1, name: '설정' })).toBeVisible();
    expect(canvas.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(canvas.queryByText('Byulmaru ID 외부 서비스')).not.toBeInTheDocument();
    expect(
      canvas.queryByText('계정 보안과 인증 설정은 Byulmaru ID에서 관리합니다.'),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('link', { name: 'Byulmaru ID 계정 설정 열기, 외부 서비스' }),
    ).toBeVisible();
    expect(canvas.queryByText('Kosmo 내부 기능')).not.toBeInTheDocument();
    expect(
      canvas.queryByText('선택한 Local Profile에 적용되는 Kosmo 설정입니다.'),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByLabelText('Kosmo 내부 프로필 설정 대상: 우주 기록자, @space-writer'),
    ).toBeVisible();
    expect(canvas.getByTestId('settings-account-chevron')).toBeVisible();

    const storyFrame = canvas.getByTestId('settings-story-frame');
    expect(storyFrame.getBoundingClientRect().width).toBeLessThanOrEqual(600);
    expect(getComputedStyle(canvas.getByTestId('settings-section-account')).borderRadius).toBe(
      '0px',
    );
    expect(getComputedStyle(canvas.getByTestId('settings-section-account')).borderBottomWidth).toBe(
      '1px',
    );
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

function SettingsStoryFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <View
      style={[styles.storyFrame, { backgroundColor: theme.background, borderColor: theme.border }]}
      testID="settings-story-frame"
    >
      {children}
    </View>
  );
}

function AccountEntryFixture() {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel="Byulmaru ID 계정 설정 열기, 외부 서비스"
      accessibilityRole="link"
      onPress={fn()}
      style={({ pressed }) => [
        styles.entry,
        { backgroundColor: pressed ? theme.surface : theme.background },
      ]}
    >
      <View style={styles.entryCopy}>
        <Text style={[styles.entryTitle, { color: theme.text }]}>Byulmaru ID에서 계정 설정</Text>
        <Text style={[styles.entryDescription, { color: theme.textSecondary }]}>
          외부 서비스로 이동
        </Text>
      </View>
      <ChevronRightIcon
        aria-hidden
        color={theme.textSecondary}
        size={20}
        testID="settings-account-chevron"
      />
    </Pressable>
  );
}

function ProfileSettingsFixture() {
  const theme = useTheme();

  return (
    <View style={styles.profileFixture}>
      <Text style={[styles.entryTitle, { color: theme.text }]}>Profile 설정 통합 영역</Text>
      <Text style={[styles.entryDescription, { color: theme.textSecondary }]}>
        PROD-648 결과가 이 영역에 연결됩니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  storyFrame: {
    alignSelf: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    flex: 1,
    maxWidth: 600,
    width: '100%',
  },
  entry: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  entryCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  entryTitle: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  entryDescription: { fontFamily: 'SUIT', ...typography.sm },
  profileFixture: {
    gap: spacing.xs,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
