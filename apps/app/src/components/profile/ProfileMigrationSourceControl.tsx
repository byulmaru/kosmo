import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, space, textStyles } from '@/theme/tokens';
import type {
  ProfileMigrationSourceControl_profile$data,
  ProfileMigrationSourceControl_profile$key,
} from './__generated__/ProfileMigrationSourceControl_profile.graphql';
import type { ProfileMigrationSourceControlMutation } from './__generated__/ProfileMigrationSourceControlMutation.graphql';
import type { ProfileMigrationSourceControlUnregisterMutation } from './__generated__/ProfileMigrationSourceControlUnregisterMutation.graphql';

const ProfileFragment = graphql`
  fragment ProfileMigrationSourceControl_profile on Profile {
    id
    displayName
    handle
    relativeHandle
    instance {
      canonicalOrigin
    }
    migrationSource {
      id
      displayName
      relativeHandle
    }
  }
`;

const RegisterMutation = graphql`
  mutation ProfileMigrationSourceControlMutation($input: RegisterProfileMigrationSourceInput!) {
    registerProfileMigrationSource(input: $input) {
      profile {
        id
        ...ProfileMigrationSourceControl_profile
      }
    }
  }
`;

const UnregisterMutation = graphql`
  mutation ProfileMigrationSourceControlUnregisterMutation {
    unregisterProfileMigrationSource {
      profile {
        id
        ...ProfileMigrationSourceControl_profile
      }
    }
  }
`;

type RegisterState = 'idle' | 'success' | 'error';
type UnregisterState = 'idle' | 'error';

export type ProfileMigrationSourceControlProps = {
  editable: boolean;
  profile: ProfileMigrationSourceControl_profile$key;
};

export function ProfileMigrationSourceControl({
  editable,
  profile: profileKey,
}: ProfileMigrationSourceControlProps) {
  const profile = useFragment(ProfileFragment, profileKey);
  const theme = useTheme();
  const [sourceHandle, setSourceHandle] = useState('');
  const [registerState, setRegisterState] = useState<RegisterState>('idle');
  const [unregisterState, setUnregisterState] = useState<UnregisterState>('idle');
  const [validationError, setValidationError] = useState<string | undefined>();
  const [registerCommit, registering] =
    useMutation<ProfileMigrationSourceControlMutation>(RegisterMutation);
  const [unregisterCommit, unregistering] =
    useMutation<ProfileMigrationSourceControlUnregisterMutation>(UnregisterMutation);
  const busy = registering || unregistering;
  if (profile.displayName == null || profile.instance == null) {
    return null;
  }

  const displayName = profile.displayName;
  const destinationHandle = getQualifiedDestinationHandle(profile);

  const register = () => {
    if (!editable || busy) {
      return;
    }

    const normalizedInput = sourceHandle.trim();
    if (!normalizedInput) {
      setValidationError('기존 계정 주소를 입력해주세요.');
      setRegisterState('idle');
      return;
    }

    setValidationError(undefined);
    registerCommit({
      variables: { input: { sourceHandle: normalizedInput } },
      onCompleted: (response) => {
        const nextProfile = response.registerProfileMigrationSource?.profile;
        if (!nextProfile || nextProfile.id !== profile.id) {
          setRegisterState('error');
          return;
        }

        setRegisterState('success');
      },
      onError: () => setRegisterState('error'),
    });
  };

  const unregister = () => {
    if (!editable || busy) {
      return;
    }

    unregisterCommit({
      variables: {},
      onCompleted: (response) => {
        const nextProfile = response.unregisterProfileMigrationSource?.profile;
        if (!nextProfile || nextProfile.id !== profile.id) {
          setUnregisterState('error');
          return;
        }

        setSourceHandle('');
        setValidationError(undefined);
        setRegisterState('idle');
        setUnregisterState('idle');
      },
      onError: () => setUnregisterState('error'),
    });
  };

  const preparedSource = profile.migrationSource;
  const controlLabel = `Kosmo 프로필 이전 원본 ${displayName} ${profile.relativeHandle}`;
  const registerButtonLabel = '기존 계정 등록';
  const unregisterButtonLabel = '기존 계정 등록 해제';

  return (
    <View
      accessibilityLabel={controlLabel}
      style={styles.root}
      testID="profile-migration-source-control"
    >
      {!preparedSource ? (
        <>
          <Text style={[styles.copy, { color: theme.textSecondary }]}>
            먼저 기존 연합우주 계정을 등록한 뒤, 기존 계정에서 이전을 시작하세요.
          </Text>
          <View style={styles.form}>
            <TextField
              accessibilityLabel="기존 계정 주소"
              autoCapitalize="none"
              autoCorrect={false}
              editable={editable && !busy}
              error={validationError}
              label="기존 계정 주소"
              onChangeText={(value) => {
                setSourceHandle(value);
                setValidationError(undefined);
                setRegisterState('idle');
              }}
              placeholder="@handle@example.com"
              value={sourceHandle}
            />
            {editable ? (
              <Button
                accessibilityLabel={registerButtonLabel}
                accessibilityState={{ busy: registering, disabled: !sourceHandle.trim() || busy }}
                disabled={!sourceHandle.trim() || busy}
                loading={registering}
                loadingText="등록 중"
                onPress={register}
                style={styles.register}
              >
                {registerButtonLabel}
              </Button>
            ) : null}
          </View>
        </>
      ) : (
        <>
          <View
            accessibilityLabel={`등록한 계정 ${preparedSource.relativeHandle}`}
            role="group"
            style={styles.accountGroup}
          >
            <Text style={[styles.copy, { color: theme.textSecondary }]}>등록한 계정</Text>
            <Text style={[styles.account, { color: theme.text }]}>
              {preparedSource.relativeHandle}
            </Text>
          </View>
          <View
            accessibilityLabel={`이전할 Kosmo 프로필 ${destinationHandle ?? '주소를 확인할 수 없어요.'}`}
            role="group"
            style={styles.nextTask}
          >
            <Text style={[styles.copy, { color: theme.textSecondary }]}>
              이제 기존 서비스에서 아래 주소로 이전을 시작하세요.
            </Text>
            <Text style={[styles.account, { color: theme.text }]}>
              {destinationHandle ?? '주소를 확인할 수 없어요.'}
            </Text>
          </View>
        </>
      )}
      {editable ? (
        <View style={[styles.footer, { borderColor: theme.divider }]}>
          <Text style={[styles.copy, { color: theme.textSecondary }]}>
            등록을 해제하면 남은 팔로워 이전이 중단될 수 있어요. 이미 옮겨온 팔로워는 유지돼요.
          </Text>
          <Button
            accessibilityLabel={unregisterButtonLabel}
            accessibilityState={{ busy: unregistering, disabled: busy }}
            disabled={busy}
            loading={unregistering}
            loadingText="해제 중"
            onPress={unregister}
            style={styles.unregister}
            tone="secondary"
          >
            {unregisterButtonLabel}
          </Button>
        </View>
      ) : (
        <Text style={[styles.copy, { color: theme.textSecondary }]}>
          프로필 소유자만 원본을 변경할 수 있어요.
        </Text>
      )}
      {registerState === 'error' ? (
        <Text accessibilityRole="alert" style={[styles.copy, { color: theme.danger }]}>
          이전 원본을 등록하지 못했어요.
        </Text>
      ) : null}
      {registerState === 'success' ? (
        <View accessibilityLiveRegion="polite" role="status">
          <Text style={[styles.copy, { color: theme.textSecondary }]}>기존 계정을 등록했어요.</Text>
        </View>
      ) : null}
      {unregisterState === 'error' ? (
        <Text accessibilityRole="alert" style={[styles.copy, { color: theme.danger }]}>
          기존 계정 등록을 해제하지 못했어요.
        </Text>
      ) : null}
    </View>
  );
}

function getQualifiedDestinationHandle(
  profile: ProfileMigrationSourceControl_profile$data,
): string | null {
  const canonicalOrigin = profile.instance?.canonicalOrigin;
  if (!canonicalOrigin) {
    return null;
  }

  return `@${profile.handle}@${new URL(canonicalOrigin).host}`;
}

const styles = StyleSheet.create({
  root: { gap: space[24] },
  account: textStyles.uiLabelM,
  accountGroup: { gap: space[4] },
  copy: textStyles.uiCopyM,
  footer: {
    borderTopWidth: borderWidths[1],
    gap: space[12],
    paddingTop: space[16],
  },
  form: { gap: space[16] },
  nextTask: { gap: space[8] },
  register: { width: '100%' },
  unregister: { alignSelf: 'flex-start' },
});
