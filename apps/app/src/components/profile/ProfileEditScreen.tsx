import { ArrowLeft } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { Button } from '../ui/Button';
import { ProfileEditForm } from './ProfileEditForm';
import { canSubmitProfileEdit, validateProfileEditDraft } from './profileEditState';
import type { ViewStyle } from 'react-native';
import type { ProfileEditFormProps } from './ProfileEditForm';
import type {
  ProfileEditDraft,
  ProfileEditFieldErrors,
  ProfileEditSubmitState,
} from './profileEditState';

export type ProfileEditScreenProps = ProfileEditFormProps & {
  initialValue: ProfileEditDraft;
  onBack?: () => void;
  onSubmit?: (draft: ProfileEditDraft) => void;
  submitState?: ProfileEditSubmitState;
};

const webStickyHeader = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
} as unknown as ViewStyle;

function mergeFieldErrors(
  local: ProfileEditFieldErrors,
  server?: ProfileEditFieldErrors,
): ProfileEditFieldErrors {
  return {
    avatar: server?.avatar,
    bio: server?.bio ?? local.bio,
    displayName: server?.displayName ?? local.displayName,
    header: server?.header,
    tags: server?.tags,
  };
}

function SubmitStatus({ state }: { state: ProfileEditSubmitState }) {
  const theme = useTheme();

  if (state.kind !== 'error') {
    return null;
  }

  return (
    <Text accessibilityRole="alert" style={[styles.submitStatus, { color: theme.danger }]}>
      {state.message}
    </Text>
  );
}

export function ProfileEditScreen({
  disabled = false,
  initialValue,
  onAvatarEdit,
  onBack,
  onChange,
  onHeaderEdit,
  onSubmit,
  serverErrors,
  submitState = { kind: 'idle' },
  value,
}: ProfileEditScreenProps) {
  const theme = useTheme();
  const errors = mergeFieldErrors(validateProfileEditDraft(value, initialValue), serverErrors);
  const saving = submitState.kind === 'saving';
  const canSubmit =
    !disabled &&
    canSubmitProfileEdit({
      errors,
      initialValue,
      onSubmit,
      submitState,
      value,
    });

  return (
    <View
      testID="profile-edit-screen"
      style={[
        styles.root,
        {
          backgroundColor: theme.background,
        },
      ]}
    >
      <View
        testID="profile-edit-screen-header"
        style={[
          styles.header,
          Platform.OS === 'web' && webStickyHeader,
          { backgroundColor: theme.background, borderColor: theme.border },
        ]}
      >
        {onBack ? (
          <Pressable
            accessibilityLabel="프로필 편집 닫기"
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={onBack}
            style={({ pressed }) => [
              styles.backAction,
              { opacity: saving ? 0.45 : pressed ? 0.7 : 1 },
            ]}
          >
            <ArrowLeft color={theme.text} size={22} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.backAction} />
        )}

        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          프로필 수정
        </Text>

        <Button
          accessibilityLabel="저장"
          accessibilityState={{ busy: saving, disabled: !canSubmit }}
          disabled={!canSubmit}
          loading={saving}
          onPress={() => onSubmit?.(value)}
          style={styles.saveAction}
        >
          저장
        </Button>
      </View>

      <ProfileEditForm
        disabled={disabled || saving}
        initialValue={initialValue}
        onAvatarEdit={onAvatarEdit}
        onChange={onChange}
        onHeaderEdit={onHeaderEdit}
        serverErrors={serverErrors}
        value={value}
      />

      <SubmitStatus state={submitState} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
    maxWidth: 600,
    minHeight: '100%',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 48,
    paddingHorizontal: spacing.sm,
  },
  backAction: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  title: {
    flex: 1,
    fontFamily: 'SUIT',
    fontWeight: '700',
    textAlign: 'center',
    ...typography.lg,
  },
  saveAction: {
    minHeight: 36,
    minWidth: 64,
  },
  submitStatus: {
    fontFamily: 'SUIT',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    ...typography.sm,
  },
});
