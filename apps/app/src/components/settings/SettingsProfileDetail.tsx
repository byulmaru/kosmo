import { PostVisibility } from '@kosmo/core/enums';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { graphql, useLazyLoadQuery, useMutation } from 'react-relay';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/tokens';
import { resolveProfileDefaultVisibility } from '../profile/profileDefaultPostVisibilityState';
import { ProfilePostingSettings } from './ProfilePostingSettings';
import { ProfileSettingsScreen } from './ProfileSettingsScreen';
import type { SettingsProfileDetailQuery } from './__generated__/SettingsProfileDetailQuery.graphql';
import type { SettingsProfileDetailUpdateProfileMutation } from './__generated__/SettingsProfileDetailUpdateProfileMutation.graphql';
import type { ProfilePostingSettingsValue } from './ProfilePostingSettings';

const query = graphql`
  query SettingsProfileDetailQuery {
    currentSession {
      selectedProfile {
        id
        displayName
        relativeHandle
        followPolicy
        instance {
          kind
        }
        private {
          defaultPostVisibility
        }
        viewerState {
          membership {
            role
          }
        }
      }
    }
  }
`;

const updateProfileMutation = graphql`
  mutation SettingsProfileDetailUpdateProfileMutation($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      profile {
        id
        followPolicy
        private {
          defaultPostVisibility
        }
      }
    }
  }
`;

function resolveFollowPolicy(value: string): ProfilePostingSettingsValue['followPolicy'] {
  if (value === 'OPEN' || value === 'APPROVAL_REQUIRED') {
    return value;
  }
  throw new Error('Unsupported Profile follow policy');
}

function resolveDefaultVisibility(
  value: string | null | undefined,
): ProfilePostingSettingsValue['defaultPostVisibility'] {
  const resolved = resolveProfileDefaultVisibility(value);
  return resolved === PostVisibility.PUBLIC ||
    resolved === PostVisibility.UNLISTED ||
    resolved === PostVisibility.FOLLOWERS
    ? resolved
    : PostVisibility.UNLISTED;
}

type PostingProfile = {
  followPolicy: string;
  private?: { defaultPostVisibility?: string | null } | null;
};

function getPostingSettings(profile: PostingProfile): ProfilePostingSettingsValue {
  return {
    defaultPostVisibility: resolveDefaultVisibility(profile.private?.defaultPostVisibility),
    followPolicy: resolveFollowPolicy(profile.followPolicy),
  };
}

type PostingSettingsInput = Partial<ProfilePostingSettingsValue>;

function getChangedPostingSettings(
  value: ProfilePostingSettingsValue,
  baseline: ProfilePostingSettingsValue,
): PostingSettingsInput {
  const input: PostingSettingsInput = {};
  if (value.defaultPostVisibility !== baseline.defaultPostVisibility) {
    input.defaultPostVisibility = value.defaultPostVisibility;
  }
  if (value.followPolicy !== baseline.followPolicy) {
    input.followPolicy = value.followPolicy;
  }
  return input;
}

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
    query,
    {},
    { fetchKey, fetchPolicy: 'network-only' },
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
    <SettingsProfileEditor
      key={`${profile.id}:${profile.viewerState?.membership?.role ?? 'NONE'}`}
      openProfileSwitcher={shellChrome?.openProfileSwitcher}
      profile={profile}
    />
  );
}

function SettingsProfileEditor({
  openProfileSwitcher,
  profile,
}: {
  openProfileSwitcher?: () => void;
  profile: NonNullable<
    NonNullable<SettingsProfileDetailQuery['response']['currentSession']>['selectedProfile']
  >;
}) {
  const editable = profile.viewerState?.membership?.role === 'OWNER';
  const theme = useTheme();
  const baseline = getPostingSettings(profile);
  const [pendingValue, setPendingValue] = useState<ProfilePostingSettingsValue | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'error'>('idle');
  const [commit, isInFlight] =
    useMutation<SettingsProfileDetailUpdateProfileMutation>(updateProfileMutation);
  const value = editable ? (pendingValue ?? baseline) : baseline;
  const saving = isInFlight;

  const handleChange = (nextValue: ProfilePostingSettingsValue) => {
    if (!editable || saving) {
      return;
    }
    const input = getChangedPostingSettings(nextValue, baseline);
    if (Object.keys(input).length === 0) {
      return;
    }
    setPendingValue(nextValue);
    setSaveState('idle');
    commit({
      variables: { input },
      onCompleted: (_response, errors) => {
        if (errors?.length) {
          setPendingValue(null);
          setSaveState('error');
          return;
        }
        setPendingValue(null);
        setSaveState('idle');
      },
      onError: () => {
        setPendingValue(null);
        setSaveState('error');
      },
    });
  };

  return (
    <ProfileSettingsScreen
      embedded
      identityAction={
        openProfileSwitcher ? (
          <Button
            accessibilityLabel="다른 Profile 선택"
            onPress={openProfileSwitcher}
            size="compact"
            tone="secondary"
          >
            Profile 전환
          </Button>
        ) : null
      }
      profile={profile}
    >
      <ProfilePostingSettings
        disabled={saving}
        editable={editable}
        onChange={handleChange}
        value={value}
      />
      {editable ? (
        <>
          {saveState === 'error' ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: theme.feedbackDangerBase }]}
            >
              설정을 저장하지 못했어요. 다시 변경해주세요.
            </Text>
          ) : null}
        </>
      ) : null}
    </ProfileSettingsScreen>
  );
}

const styles = StyleSheet.create({
  error: { ...textStyles.uiCopyM },
});
