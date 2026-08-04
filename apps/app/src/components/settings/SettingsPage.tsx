import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { ProfileDefaultPostVisibilityControl } from '@/components/profile/ProfileDefaultPostVisibilityControl';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, spacing, typography } from '@/theme/tokens';
import { ByulmaruIdAccountSettingsEntry } from './ByulmaruIdAccountSettingsEntry';
import type { ReactNode } from 'react';
import type { SettingsPage_profile$key } from './__generated__/SettingsPage_profile.graphql';

const SettingsProfileFragment = graphql`
  fragment SettingsPage_profile on Profile {
    viewerState {
      isSelf
    }
    ...ProfileDefaultPostVisibilityControl_profile
  }
`;

export type SettingsPageProps = {
  accountEntry?: ReactNode;
  profile: SettingsPage_profile$key | null;
};

export function SettingsPage({ accountEntry, profile: profileKey }: SettingsPageProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const shell = useShellChrome();
  const profile = useFragment(SettingsProfileFragment, profileKey);
  const showContentHeader = Platform.OS !== 'web' || width >= breakpoints.compact;

  return (
    <ScrollView contentContainerStyle={styles.root} testID="settings-page">
      {showContentHeader ? <PageHeader title="설정" /> : null}
      <View style={styles.content}>
        {accountEntry ?? <ByulmaruIdAccountSettingsEntry />}
        <View style={[styles.profileSection, { borderColor: theme.divider }]}>
          {profile ? (
            <ProfileDefaultPostVisibilityControl
              editable={profile.viewerState?.isSelf ?? false}
              profile={profile}
            />
          ) : (
            <View style={styles.empty} testID="settings-profile-empty">
              <Text style={[styles.emptyTitle, { color: theme.text }]}>프로필 설정이 없어요</Text>
              <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
                기본 게시 공개 범위를 설정하려면 사용할 프로필을 먼저 선택해주세요.
              </Text>
              <Button
                disabled={!shell}
                onPress={() => shell?.openProfileSwitcher()}
                tone="secondary"
              >
                프로필 선택
              </Button>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, width: '100%' },
  content: {
    alignSelf: 'center',
    maxWidth: 680,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    width: '100%',
  },
  profileSection: { borderTopWidth: 1, paddingTop: spacing.xl },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyTitle: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  emptyDescription: { textAlign: 'center', ...typography.sm },
});
