import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type {
  ProfileMigrationSourceControl_profile$data,
  ProfileMigrationSourceControl_profile$key,
} from './__generated__/ProfileMigrationSourceControl_profile.graphql';
import type { ProfileMigrationSourceControlMutation } from './__generated__/ProfileMigrationSourceControlMutation.graphql';

const ProfileFragment = graphql`
  fragment ProfileMigrationSourceControl_profile on Profile {
    id
    displayName
    relativeHandle
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
        migrationSource {
          id
          displayName
          relativeHandle
        }
        ...ProfileMigrationSourceControl_profile
      }
    }
  }
`;

type RegisterState = 'idle' | 'registering' | 'success' | 'error';

export type ProfileMigrationSourceControlProps = {
  editable: boolean;
  profile: ProfileMigrationSourceControl_profile$key;
};

export function ProfileMigrationSourceControl({
  editable,
  profile: profileKey,
}: ProfileMigrationSourceControlProps) {
  const profile = useFragment(ProfileFragment, profileKey);
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const environmentRef = useRef(environment);
  const contextGenerationRef = useRef(0);
  if (environmentRef.current !== environment) {
    environmentRef.current = environment;
    contextGenerationRef.current += 1;
  }

  return (
    <ProfileMigrationSourceControlContents
      editable={editable}
      key={`${profile.id}:${contextGenerationRef.current}:${environmentGenerationRef?.current ?? 0}`}
      profile={profile}
    />
  );
}

function ProfileMigrationSourceControlContents({
  editable,
  profile,
}: {
  editable: boolean;
  profile: ProfileMigrationSourceControl_profile$data;
}) {
  const theme = useTheme();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const [sourceHandle, setSourceHandle] = useState('');
  const [registerState, setRegisterState] = useState<RegisterState>('idle');
  const [validationError, setValidationError] = useState<string | undefined>();
  const [commit] = useMutation<ProfileMigrationSourceControlMutation>(RegisterMutation);
  const registerRequestIdRef = useRef(0);
  const registerInFlightRef = useRef<number | null>(null);

  const register = () => {
    if (!editable || registerInFlightRef.current !== null) {
      return;
    }

    const normalizedInput = sourceHandle.trim();
    if (!normalizedInput) {
      setValidationError('이전할 프로필 주소를 입력해주세요.');
      setRegisterState('idle');
      return;
    }

    setValidationError(undefined);
    const environmentGeneration = environmentGenerationRef?.current;
    const requestId = registerRequestIdRef.current + 1;
    registerRequestIdRef.current = requestId;
    registerInFlightRef.current = requestId;
    setRegisterState('registering');

    commit({
      variables: { input: { sourceHandle: normalizedInput } },
      onCompleted: (response, errors) => {
        if (
          registerInFlightRef.current !== requestId ||
          environmentGenerationRef?.current !== environmentGeneration
        ) {
          if (registerInFlightRef.current === requestId) {
            registerInFlightRef.current = null;
          }
          return;
        }
        registerInFlightRef.current = null;

        const nextSource = response.registerProfileMigrationSource?.profile?.migrationSource;
        if (errors?.length || !nextSource) {
          setRegisterState('error');
          return;
        }

        setSourceHandle(nextSource.relativeHandle);
        setRegisterState('success');
      },
      onError: () => {
        if (
          registerInFlightRef.current !== requestId ||
          environmentGenerationRef?.current !== environmentGeneration
        ) {
          if (registerInFlightRef.current === requestId) {
            registerInFlightRef.current = null;
          }
          return;
        }
        registerInFlightRef.current = null;
        setRegisterState('error');
      },
    });
  };

  const registering = registerState === 'registering';
  const preparedSource = profile.migrationSource;
  const controlLabel = `Kosmo 프로필 이전 원본 ${profile.displayName} ${profile.relativeHandle}`;
  const registerButtonLabel = registerState === 'error' ? '다시 시도' : '원본 등록';

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
        이전할 프로필 주소(@name@server)를 입력해 원본으로 등록하세요.
      </Text>
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
          accessibilityLabel="이전할 프로필 주소"
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable && !registering}
          error={validationError}
          label="이전할 프로필 주소"
          onChangeText={(value) => {
            setSourceHandle(value);
            setValidationError(undefined);
            setRegisterState('idle');
          }}
          placeholder="@handle@example.com"
          value={sourceHandle}
        />
      ) : null}
      {editable && !preparedSource ? (
        <Button
          accessibilityLabel={registerButtonLabel}
          accessibilityState={{ busy: registering, disabled: !sourceHandle.trim() }}
          disabled={!sourceHandle.trim()}
          loading={registering}
          loadingText="등록 중"
          onPress={register}
          style={styles.register}
        >
          {registerButtonLabel}
        </Button>
      ) : editable && preparedSource ? (
        <Text style={[styles.memberNote, { color: theme.textSecondary }]}>
          등록된 원본은 교체할 수 없어요.
        </Text>
      ) : (
        <Text style={[styles.memberNote, { color: theme.textSecondary }]}>
          프로필 소유자만 원본을 등록할 수 있어요.
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
            기존 Mastodon 계정에서 이 Kosmo 프로필로 이전을 실행하세요
          </Text>
        </View>
      ) : null}
    </View>
  );
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
