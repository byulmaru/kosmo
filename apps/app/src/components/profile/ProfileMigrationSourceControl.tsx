import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
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
  const controlLabel = `Kosmo 프로필 이전 원본 ${profile.displayName} ${profile.relativeHandle}`;
  const registerButtonLabel = '기존 계정 등록';
  const unregisterButtonLabel = '기존 계정 등록 해제';

  return (
    <View
      accessibilityLabel={controlLabel}
      style={[styles.root, { backgroundColor: theme.card, borderColor: theme.border }]}
      testID="profile-migration-source-control"
    >
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        프로필 이전 원본
      </Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        기존 계정 주소를 먼저 등록한 뒤 기존 서비스에서 이 Kosmo 프로필로 Move를 시작하세요.
        팔로워는 옮길 수 있지만 게시물은 복사되지 않아요.
      </Text>
      <View
        accessibilityLabel={`이전받을 Kosmo 프로필 ${profile.displayName} ${destinationHandle ?? ''}`.trim()}
        role="group"
      >
        <Text style={[styles.sourceLabel, { color: theme.textSecondary }]}>
          이전받을 Kosmo 프로필
        </Text>
        <Text style={[styles.sourceName, { color: theme.text }]}>{profile.displayName}</Text>
        {destinationHandle ? (
          <Text style={[styles.sourceHandle, { color: theme.textSecondary }]}>
            {destinationHandle}
          </Text>
        ) : (
          <Text style={[styles.sourceHandle, { color: theme.textSecondary }]}>
            주소를 확인할 수 없어요.
          </Text>
        )}
      </View>
      {preparedSource ? (
        <View
          accessibilityLabel={`현재 등록된 원본 ${preparedSource.displayName} ${preparedSource.relativeHandle}`}
          role="group"
        >
          <Text style={[styles.sourceLabel, { color: theme.textSecondary }]}>현재 등록된 원본</Text>
          <Text style={[styles.sourceName, { color: theme.text }]}>
            {preparedSource.displayName}
          </Text>
          <Text style={[styles.sourceHandle, { color: theme.textSecondary }]}>
            {preparedSource.relativeHandle}
          </Text>
        </View>
      ) : null}
      {!preparedSource ? (
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
      ) : null}
      {editable ? (
        <>
          {!preparedSource ? (
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
          <Button
            accessibilityLabel={unregisterButtonLabel}
            accessibilityState={{ busy: unregistering, disabled: busy }}
            disabled={busy}
            loading={unregistering}
            loadingText="해제 중"
            onPress={unregister}
            style={styles.register}
          >
            {unregisterButtonLabel}
          </Button>
          <Text style={[styles.memberNote, { color: theme.textSecondary }]}>
            등록 해제 후 남은 팔로워 이전은 중단될 수 있어요. 이미 이전된 팔로워는 그대로 유지돼요.
          </Text>
        </>
      ) : (
        <Text style={[styles.memberNote, { color: theme.textSecondary }]}>
          프로필 소유자만 원본을 변경할 수 있어요.
        </Text>
      )}
      {registerState === 'error' ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          이전 원본을 등록하지 못했어요.
        </Text>
      ) : null}
      {registerState === 'success' ? (
        <View accessibilityLiveRegion="polite">
          <Text style={[styles.success, { color: theme.textSecondary }]}>
            이전 원본을 등록했어요
          </Text>
          <Text style={[styles.success, { color: theme.textSecondary }]}>
            이제 기존 서비스의 계정에서 이 Kosmo 프로필로 Move를 시작하세요.
          </Text>
        </View>
      ) : null}
      {unregisterState === 'error' ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          기존 계정 등록을 해제하지 못했어요.
        </Text>
      ) : null}
    </View>
  );
}

function getQualifiedDestinationHandle(
  profile: ProfileMigrationSourceControl_profile$data,
): string | null {
  if (!profile.instance.canonicalOrigin) {
    return null;
  }

  return `@${profile.handle}@${new URL(profile.instance.canonicalOrigin).host}`;
}

const styles = StyleSheet.create({
  root: { borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  title: { fontFamily: 'SUIT', fontWeight: '700', ...typography.lg },
  description: { fontFamily: 'SUIT', ...typography.sm },
  sourceLabel: { fontFamily: 'SUIT', ...typography.sm },
  sourceName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  sourceHandle: { fontFamily: 'SUIT', ...typography.sm },
  error: { fontFamily: 'SUIT', ...typography.sm },
  success: { fontFamily: 'SUIT', ...typography.sm },
  memberNote: { fontFamily: 'SUIT', ...typography.sm },
  register: { alignSelf: 'flex-start' },
});
