import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { ProfileDefaultPostVisibilityControl } from '@/components/profile/ProfileDefaultPostVisibilityControl';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { spacing } from '@/theme/tokens';
import type { SettingsProfileDetailQuery } from './__generated__/SettingsProfileDetailQuery.graphql';

const SettingsProfileQuery = graphql`
  query SettingsProfileDetailQuery {
    currentSession {
      selectedProfile {
        id
        instance {
          kind
        }
        viewerState {
          membership {
            role
          }
        }
        ...ProfileDefaultPostVisibilityControl_profile
      }
    }
  }
`;

export function SettingsProfileDetail() {
  return (
    <RouteBoundary
      loading={<StateView loading title="Profile 설정을 불러오는 중입니다." />}
      title="Profile 설정을 불러오지 못했어요"
    >
      <SettingsProfileDetailContents />
    </RouteBoundary>
  );
}

function SettingsProfileDetailContents() {
  const { fetchKey } = useRouteBoundary();
  const shellChrome = useShellChrome();
  const data = useLazyLoadQuery<SettingsProfileDetailQuery>(
    SettingsProfileQuery,
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

  const editable = profile.viewerState?.membership?.role === 'OWNER';

  return (
    <View style={styles.root}>
      <ProfileDefaultPostVisibilityControl
        editable={editable}
        profile={profile}
        showTitle={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: spacing.lg },
});
