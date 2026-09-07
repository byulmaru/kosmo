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

const PrepareMutation = graphql`
  mutation ProfileMigrationSourceControlMutation($input: PrepareProfileMigrationInput!) {
    prepareProfileMigration(input: $input) {
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

type PrepareState = 'idle' | 'preparing' | 'success' | 'error';

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
  const [prepareState, setPrepareState] = useState<PrepareState>('idle');
  const [validationError, setValidationError] = useState<string | undefined>();
  const [commit] = useMutation<ProfileMigrationSourceControlMutation>(PrepareMutation);
  const prepareRequestIdRef = useRef(0);
  const prepareInFlightRef = useRef<number | null>(null);

  const prepare = () => {
    if (!editable || prepareInFlightRef.current !== null) {
      return;
    }

    const normalizedInput = sourceHandle.trim();
    if (!normalizedInput) {
      setValidationError('이전할 프로필 주소를 입력해주세요.');
      setPrepareState('idle');
      return;
    }

    setValidationError(undefined);
    const environmentGeneration = environmentGenerationRef?.current;
    const requestId = prepareRequestIdRef.current + 1;
    prepareRequestIdRef.current = requestId;
    prepareInFlightRef.current = requestId;
    setPrepareState('preparing');

    commit({
      variables: { input: { profileId: profile.id, sourceHandle: normalizedInput } },
      onCompleted: (response, errors) => {
        if (
          prepareInFlightRef.current !== requestId ||
          environmentGenerationRef?.current !== environmentGeneration
        ) {
          if (prepareInFlightRef.current === requestId) {
            prepareInFlightRef.current = null;
          }
          return;
        }
        prepareInFlightRef.current = null;

        const nextSource = response.prepareProfileMigration?.profile?.migrationSource;
        if (errors?.length || !nextSource) {
          setPrepareState('error');
          return;
        }

        setSourceHandle(nextSource.relativeHandle);
        setPrepareState('success');
      },
      onError: () => {
        if (
          prepareInFlightRef.current !== requestId ||
          environmentGenerationRef?.current !== environmentGeneration
        ) {
          if (prepareInFlightRef.current === requestId) {
            prepareInFlightRef.current = null;
          }
          return;
        }
        prepareInFlightRef.current = null;
        setPrepareState('error');
      },
    });
  };

  const preparing = prepareState === 'preparing';
  const preparedSource = profile.migrationSource;
  const controlLabel = `Kosmo 프로필 이전 원본 ${profile.displayName} ${profile.relativeHandle}`;
  const prepareButtonLabel = prepareState === 'error' ? '다시 시도' : '원본 프로필 준비';

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
        이전할 프로필 주소(@name@server)를 입력해 원본으로 미리 연결하세요.
      </Text>
      {preparedSource ? (
        <View
          accessibilityLabel={`현재 준비된 원본 ${preparedSource.displayName} ${preparedSource.relativeHandle}`}
          role="group"
        >
          <Text style={[styles.sourceLabel, { color: theme.textSecondary }]}>현재 준비된 원본</Text>
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
          editable={editable && !preparing}
          error={validationError}
          label="이전할 프로필 주소"
          onChangeText={(value) => {
            setSourceHandle(value);
            setValidationError(undefined);
            setPrepareState('idle');
          }}
          placeholder="@handle@example.com"
          value={sourceHandle}
        />
      ) : null}
      {editable && !preparedSource ? (
        <Button
          accessibilityLabel={prepareButtonLabel}
          accessibilityState={{ busy: preparing, disabled: !sourceHandle.trim() }}
          disabled={!sourceHandle.trim()}
          loading={preparing}
          loadingText="준비 중"
          onPress={prepare}
          style={styles.prepare}
        >
          {prepareButtonLabel}
        </Button>
      ) : editable && preparedSource ? (
        <Text style={[styles.memberNote, { color: theme.textSecondary }]}>
          준비된 원본은 교체할 수 없어요.
        </Text>
      ) : (
        <Text style={[styles.memberNote, { color: theme.textSecondary }]}>
          프로필 소유자만 원본을 준비할 수 있어요.
        </Text>
      )}
      {prepareState === 'error' ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          원본 프로필을 준비하지 못했어요.
        </Text>
      ) : null}
      {prepareState === 'success' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.success, { color: theme.textSecondary }]}
        >
          원본 프로필을 준비했어요.
        </Text>
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
  prepare: { alignSelf: 'flex-start' },
});
