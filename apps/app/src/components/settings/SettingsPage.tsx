import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
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
  routeOwnsHeader?: boolean;
};

export function SettingsPage({
  accountContent,
  profileState,
  routeOwnsHeader = true,
}: SettingsPageProps) {
  return (
    <ScrollView contentContainerStyle={styles.root}>
      {routeOwnsHeader ? <PageHeader title="설정" /> : null}
      <View style={styles.body}>
        <SettingsSection
          description="계정 보안과 인증 설정은 Byulmaru ID에서 관리합니다."
          owner="Byulmaru ID 외부 서비스"
          title="계정 설정"
        >
          {accountContent}
        </SettingsSection>

        <SettingsSection
          description="선택한 Local Profile에 적용되는 Kosmo 설정입니다."
          owner="Kosmo 내부 기능"
          title="프로필 설정"
        >
          <ProfileSettingsContent state={profileState} />
        </SettingsSection>
      </View>
    </ScrollView>
  );
}

function SettingsSection({
  children,
  description,
  owner,
  title,
}: {
  children: ReactNode;
  description: string;
  owner: string;
  title: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>
          {title}
        </Text>
        <Text style={[styles.owner, { color: theme.textSecondary }]}>{owner}</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
      </View>
      <View style={styles.sectionContent}>{children}</View>
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
        accessibilityLabel={`현재 프로필 설정 대상: ${state.displayName}, ${state.relativeHandle}`}
        accessible
        style={[styles.profileIdentity, { backgroundColor: theme.surface }]}
      >
        <Text style={[styles.profileName, { color: theme.text }]}>{state.displayName}</Text>
        <Text style={[styles.profileHandle, { color: theme.textSecondary }]}>
          {state.relativeHandle}
        </Text>
      </View>
      {state.content}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1 },
  body: { gap: spacing.xl, padding: spacing.xl },
  section: {
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: { gap: spacing.xs, padding: spacing.lg },
  sectionTitle: { fontFamily: 'SUIT', fontWeight: '700', ...typography.lg },
  owner: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  description: { fontFamily: 'SUIT', ...typography.sm },
  sectionContent: { padding: spacing.lg, paddingTop: 0 },
  profileContent: { gap: spacing.lg },
  profileIdentity: {
    borderRadius: radii.sm,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  profileName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  profileHandle: { fontFamily: 'SUIT', ...typography.sm },
});
