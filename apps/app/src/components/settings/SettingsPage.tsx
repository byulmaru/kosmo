import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { ReactElement, ReactNode } from 'react';

type SelectedProfileSettings = {
  content: ReactElement;
  displayName: string;
  relativeHandle: string;
  status: 'selected';
};

type EmptyProfileSettings = {
  actionLabel: '프로필 만들기' | '프로필 선택';
  status: 'empty';
};

type LoadingProfileSettings = {
  status: 'loading';
};

type ErrorProfileSettings = {
  onRetry: () => void;
  status: 'error';
};

export type SettingsProfileState =
  | SelectedProfileSettings
  | EmptyProfileSettings
  | LoadingProfileSettings
  | ErrorProfileSettings;

type SettingsPageProps = {
  accountContent: ReactElement;
  profileState: SettingsProfileState;
};

export function SettingsPage({ accountContent, profileState }: SettingsPageProps) {
  return (
    <ScrollView contentContainerStyle={styles.root}>
      <PageHeader title="설정" />
      <View style={styles.body}>
        <SettingsSection testID="settings-section-account">{accountContent}</SettingsSection>

        <SettingsSection testID="settings-section-profile">
          <ProfileSettingsContent state={profileState} />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}

function SettingsSection({ children, testID }: { children: ReactNode; testID: string }) {
  const theme = useTheme();

  return (
    <View
      style={[styles.section, { backgroundColor: theme.background, borderColor: theme.border }]}
      testID={testID}
    >
      {children}
    </View>
  );
}

function ProfileSettingsContent({ state }: { state: SettingsProfileState }) {
  const theme = useTheme();
  const shellChrome = useShellChrome();

  if (state.status === 'loading') {
    return <StateView loading title="프로필 설정을 불러오는 중입니다." />;
  }

  if (state.status === 'error') {
    return (
      <StateView
        actionLabel="다시 시도"
        alert
        description="다른 Profile의 값을 대신 표시하지 않습니다. 잠시 후 다시 시도해주세요."
        onAction={state.onRetry}
        title="프로필 설정을 불러오지 못했어요"
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <StateView
        actionLabel={state.actionLabel}
        description="설정할 Local Profile을 선택하거나 새로 만들어주세요."
        onAction={() => shellChrome?.openProfileSwitcher()}
        title="설정할 프로필이 없어요"
      />
    );
  }

  return (
    <View style={styles.profileContent}>
      <View
        accessibilityLabel={`Kosmo 내부 프로필 설정 대상: ${state.displayName}, ${state.relativeHandle}`}
        accessible
        style={[styles.profileIdentity, { borderColor: theme.divider }]}
      >
        <Text style={[styles.profileContext, { color: theme.textSecondary }]}>현재 프로필</Text>
        <View style={styles.profileIdentityValue}>
          <Text style={[styles.profileName, { color: theme.text }]}>{state.displayName}</Text>
          <Text style={[styles.profileHandle, { color: theme.textSecondary }]}>
            {state.relativeHandle}
          </Text>
        </View>
      </View>
      {state.content}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1 },
  body: { width: '100%' },
  section: {
    borderBottomWidth: 1,
    width: '100%',
  },
  profileContent: { width: '100%' },
  profileIdentity: {
    borderBottomWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  profileContext: { fontFamily: 'SUIT', fontWeight: '700', ...typography.xsm },
  profileIdentityValue: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  profileName: {
    flexShrink: 1,
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...typography.sm,
  },
  profileHandle: { flexShrink: 1, fontFamily: 'SUIT', ...typography.sm },
});
