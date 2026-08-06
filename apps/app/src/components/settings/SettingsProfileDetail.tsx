import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { ProfileDefaultPostVisibilityControl } from '@/components/profile/ProfileDefaultPostVisibilityControl';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { spacing } from '@/theme/tokens';
import type { SettingsProfileDetailQuery } from './__generated__/SettingsProfileDetailQuery.graphql';

const SettingsProfileQuery = graphql`
  query SettingsProfileDetailQuery {
    currentSession {
      selectedProfile {
        id
        ...ProfileDefaultPostVisibilityControl_profile
      }
    }
    selectedProfileForEdit {
      id
    }
  }
`;

export function SettingsProfileDetail() {
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);
  const identity = `${revision}:${fetchKey}`;

  return (
    <RouteBoundary
      key={identity}
      loading={<StateView loading title="Profile 설정을 불러오는 중입니다." />}
      onRetry={() => setFetchKey((current) => current + 1)}
      title="Profile 설정을 불러오지 못했어요"
    >
      <SettingsProfileDetailContents fetchKey={identity} />
    </RouteBoundary>
  );
}

function SettingsProfileDetailContents({ fetchKey }: { fetchKey: string }) {
  const shellChrome = useShellChrome();
  const data = useLazyLoadQuery<SettingsProfileDetailQuery>(
    SettingsProfileQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;

  if (!profile) {
    return (
      <StateView
        actionLabel={shellChrome ? 'Profile 선택하기' : undefined}
        onAction={shellChrome?.openProfileSwitcher}
        title="설정할 Profile이 없어요"
      />
    );
  }

  const editable = data.selectedProfileForEdit?.id === profile.id;

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
