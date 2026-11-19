import { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { TextField } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, breakpoints, radius, space, textStyles } from '@/theme/tokens';
import type { TextInput, View as NativeView } from 'react-native';
import type {
  ProfileMigrationSourceControl_profile$data,
  ProfileMigrationSourceControl_profile$key,
} from './__generated__/ProfileMigrationSourceControl_profile.graphql';
import type { ProfileMigrationSourceControlMutation } from './__generated__/ProfileMigrationSourceControlMutation.graphql';
import type { ProfileMigrationSourceControlUnregisterMutation } from './__generated__/ProfileMigrationSourceControlUnregisterMutation.graphql';

const ProfileFragment = graphql`
  fragment ProfileMigrationSourceControl_profile on Profile {
    id
    hasMigrationSource
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
  const { width } = useWindowDimensions();
  const wideWeb = Platform.OS === 'web' && width >= breakpoints.compact;
  const [sourceHandle, setSourceHandle] = useState('');
  const [registerState, setRegisterState] = useState<RegisterState>('idle');
  const [unregisterState, setUnregisterState] = useState<UnregisterState>('idle');
  const [unregisterConfirmationOpen, setUnregisterConfirmationOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | undefined>();
  // The trigger unmounts on success; Web dismissal must focus the replacement input.
  const sourceInputRef = useRef<TextInput>(null);
  const unregisterButtonRef = useRef<NativeView>(null);
  const cancelRef = useRef<NativeView>(null);
  const [registerCommit, registering] =
    useMutation<ProfileMigrationSourceControlMutation>(RegisterMutation);
  const [unregisterCommit, unregistering] =
    useMutation<ProfileMigrationSourceControlUnregisterMutation>(UnregisterMutation);
  const busy = registering || unregistering;
  if (profile.displayName == null || profile.instance == null) {
    return null;
  }

  const displayName = profile.displayName;
  const controlLabel = `Kosmo 프로필 이전 원본 ${displayName} ${profile.relativeHandle}`;
  if (editable && typeof profile.hasMigrationSource !== 'boolean') {
    return (
      <View
        accessibilityLabel={controlLabel}
        style={styles.root}
        testID="profile-migration-source-control"
      >
        <Text accessibilityRole="alert" style={[styles.copy, { color: theme.danger }]}>
          이전 설정을 확인하지 못했어요.
        </Text>
      </View>
    );
  }

  const destinationHandle = getQualifiedDestinationHandle(profile);
  const hasRegisteredSource = editable
    ? profile.hasMigrationSource === true
    : profile.migrationSource != null;
  const canRegister = editable && profile.hasMigrationSource === false;
  const canUnregister = editable && profile.hasMigrationSource === true;
  const preparedSource =
    hasRegisteredSource && profile.migrationSource != null ? profile.migrationSource : null;

  const register = () => {
    if (!canRegister || busy) {
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
    if (!canUnregister || busy || !unregisterConfirmationOpen) {
      return;
    }

    setUnregisterState('idle');
    unregisterCommit({
      variables: {},
      onCompleted: (response) => {
        const nextProfile = response.unregisterProfileMigrationSource?.profile;
        if (!nextProfile || nextProfile.id !== profile.id) {
          setUnregisterState('error');
          setUnregisterConfirmationOpen(false);
          return;
        }

        setSourceHandle('');
        setValidationError(undefined);
        setRegisterState('idle');
        setUnregisterState('idle');
        setUnregisterConfirmationOpen(false);
      },
      onError: () => {
        setUnregisterState('error');
        setUnregisterConfirmationOpen(false);
      },
    });
  };

  const closeUnregisterConfirmation = () => {
    if (!unregistering) {
      setUnregisterConfirmationOpen(false);
    }
  };

  const registerButtonLabel = '기존 계정 등록';
  const unregisterButtonLabel = '기존 계정 등록 해제';

  return (
    <View
      accessibilityLabel={controlLabel}
      style={styles.root}
      testID="profile-migration-source-control"
    >
      {canRegister || (!editable && !hasRegisteredSource) ? (
        <>
          <Text style={[styles.copy, { color: theme.textSecondary }]}>
            먼저 기존 연합우주 계정을 등록한 뒤, 기존 계정에서 이전을 시작하세요.
          </Text>
          <View style={[styles.form, wideWeb ? styles.wideForm : undefined]}>
            <View style={wideWeb ? styles.field : undefined}>
              <TextField
                accessibilityLabel="기존 계정 주소"
                autoCapitalize="none"
                autoCorrect={false}
                editable={canRegister && !busy}
                error={validationError}
                label="기존 계정 주소"
                onChangeText={(value) => {
                  setSourceHandle(value);
                  setValidationError(undefined);
                  setRegisterState('idle');
                }}
                placeholder="@handle@example.com"
                ref={sourceInputRef}
                value={sourceHandle}
              />
            </View>
            {canRegister ? (
              <Button
                accessibilityLabel={registerButtonLabel}
                accessibilityState={{ busy: registering, disabled: !sourceHandle.trim() || busy }}
                disabled={!sourceHandle.trim() || busy}
                loading={registering}
                loadingText="등록 중"
                onPress={register}
                style={wideWeb ? styles.wideRegister : styles.register}
              >
                {registerButtonLabel}
              </Button>
            ) : null}
          </View>
        </>
      ) : hasRegisteredSource ? (
        <>
          <View
            style={[
              styles.accountPanel,
              { backgroundColor: theme.backgroundSurface, borderColor: theme.borderDefault },
            ]}
          >
            <View style={styles.accountRow}>
              <View
                accessibilityLabel={
                  preparedSource ? `등록한 계정 ${preparedSource.relativeHandle}` : '등록한 계정'
                }
                role="group"
                style={styles.accountIdentity}
              >
                <Text style={[styles.accountTitle, { color: theme.foregroundPrimary }]}>
                  등록한 계정
                </Text>
                {preparedSource ? (
                  <Text style={[styles.account, { color: theme.foregroundPrimary }]}>
                    {preparedSource.relativeHandle}
                  </Text>
                ) : null}
              </View>
              {canUnregister ? (
                <Button
                  accessibilityLabel={unregisterButtonLabel}
                  accessibilityState={{
                    busy: unregistering,
                    disabled: busy,
                  }}
                  controlRef={unregisterButtonRef}
                  disabled={busy}
                  loading={unregistering}
                  loadingText="해제 중"
                  onPress={() => {
                    setUnregisterState('idle');
                    setUnregisterConfirmationOpen(true);
                  }}
                  style={styles.unregister}
                  tone="secondary"
                >
                  등록 해제
                </Button>
              ) : null}
            </View>
            <View
              accessibilityLabel={`이전할 Kosmo 프로필 ${destinationHandle ?? '주소를 확인할 수 없어요.'}`}
              role="group"
              style={[styles.nextTask, { borderColor: theme.borderDefault }]}
            >
              <Text style={[styles.copy, { color: theme.foregroundPrimary }]}>
                아직 이전하지 않았다면, 기존 서비스에서 아래 주소로 이전을 시작하세요.
              </Text>
              <Text style={[styles.account, { color: theme.foregroundPrimary }]}>
                {destinationHandle ?? '주소를 확인할 수 없어요.'}
              </Text>
            </View>
          </View>
        </>
      ) : null}
      {!editable ? (
        <Text style={[styles.copy, { color: theme.textSecondary }]}>
          프로필 소유자만 원본을 변경할 수 있어요.
        </Text>
      ) : null}
      {registerState === 'error' && canRegister ? (
        <Text accessibilityRole="alert" style={[styles.copy, { color: theme.danger }]}>
          이전 원본을 등록하지 못했어요.
        </Text>
      ) : null}
      {registerState === 'success' && preparedSource ? (
        <View accessibilityLiveRegion="polite" role="status">
          <Text style={[styles.copy, { color: theme.textSecondary }]}>기존 계정을 등록했어요.</Text>
        </View>
      ) : null}
      {unregisterState === 'error' ? (
        <Text accessibilityRole="alert" style={[styles.copy, { color: theme.danger }]}>
          기존 계정 등록을 해제하지 못했어요.
        </Text>
      ) : null}
      <ModalSheet
        dismissDisabled={unregistering}
        onClose={closeUnregisterConfirmation}
        onDismiss={() => {
          if (Platform.OS !== 'web') {
            return;
          }
          if (canUnregister) {
            unregisterButtonRef.current?.focus();
          } else {
            sourceInputRef.current?.focus();
          }
        }}
        onShow={() => {
          if (Platform.OS === 'web') {
            cancelRef.current?.focus();
          }
        }}
        role="alertdialog"
        title="기존 계정 등록을 해제할까요?"
        visible={unregisterConfirmationOpen}
      >
        <ConfirmationContent
          cancelLabel="취소"
          cancelRef={cancelRef}
          confirmLabel="등록 해제"
          onCancel={closeUnregisterConfirmation}
          onConfirm={unregister}
          pending={unregistering}
          tone="danger"
        >
          {preparedSource ? (
            <Text style={[styles.dialogAccount, { color: theme.foregroundPrimary }]}>
              {preparedSource.relativeHandle}
            </Text>
          ) : null}
          <Text style={[styles.copy, { color: theme.foregroundSecondary }]}>
            등록을 해제하면 남은 팔로워 이전이 중단될 수 있어요. 이미 옮겨온 팔로워는 유지돼요.
          </Text>
        </ConfirmationContent>
      </ModalSheet>
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
  account: textStyles.uiLabelL,
  accountIdentity: { flex: 1, minWidth: 0 },
  accountPanel: {
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    padding: space[16],
  },
  accountRow: { alignItems: 'center', flexDirection: 'row', gap: space[12], minHeight: space[32] },
  accountTitle: { ...textStyles.uiLabelL, marginBottom: space[4] },
  copy: textStyles.uiCopyM,
  dialogAccount: { ...textStyles.uiLabelL, marginBottom: space[0] },
  field: { flex: 1, minWidth: 0 },
  form: { gap: space[16] },
  wideForm: { flexDirection: 'row', alignItems: 'flex-start', gap: space[12] },
  nextTask: {
    borderTopWidth: borderWidths[1],
    gap: space[8],
    marginTop: space[16],
    paddingTop: space[16],
  },
  register: { width: '100%' },
  wideRegister: { marginTop: space[24] },
  unregister: { alignSelf: 'flex-start', minWidth: 96, paddingHorizontal: space[0], width: 96 },
});
