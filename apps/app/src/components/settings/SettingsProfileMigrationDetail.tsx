import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { useFeatureFlag } from '@/components/FeatureFlagsContext';
import { ProfileMigrationSourceControl } from '@/components/profile/ProfileMigrationSourceControl';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { spacing } from '@/theme/tokens';
import type { SettingsProfileMigrationDetailQuery } from './__generated__/SettingsProfileMigrationDetailQuery.graphql';

const SettingsProfileMigrationQuery = graphql`
  query SettingsProfileMigrationDetailQuery {
    currentSession {
      selectedProfile {
        instance {
          kind
        }
        viewerState {
          membership {
            role
          }
        }
        ...ProfileMigrationSourceControl_profile
      }
    }
  }
`;

export function SettingsProfileMigrationDetail() {
  const migrationEnabled = useFeatureFlag('profile-migration');
  if (!migrationEnabled) {
    return <StateView title="현재 이용할 수 없는 설정이에요" />;
  }

  return (
    <RouteBoundary
      loading={<StateView loading title="이전 설정을 불러오는 중입니다." />}
      title="이전 설정을 불러오지 못했어요"
    >
      <SettingsProfileMigrationDetailContents />
    </RouteBoundary>
  );
}

function SettingsProfileMigrationDetailContents() {
  const { fetchKey } = useRouteBoundary();
  const shellChrome = useShellChrome();
  const data = useLazyLoadQuery<SettingsProfileMigrationDetailQuery>(
    SettingsProfileMigrationQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;

  if (!profile || profile.instance.kind !== 'LOCAL') {
    return (
      <StateView
        actionLabel={shellChrome ? 'Profile 선택하기' : undefined}
        onAction={shellChrome?.openProfileSwitcher}
        title="설정할 Profile이 없어요"
      />
    );
  }

  return (
    <View style={styles.root}>
      <ProfileMigrationSourceControl
        editable={profile.viewerState?.membership?.role === 'OWNER'}
        profile={profile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg },
});
