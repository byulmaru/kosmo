import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import { RouteScrollContainer } from '../ui/RouteScrollContainer';
import { ProfileEditForm } from './ProfileEditForm';
import { ProfileEditHeader } from './ProfileEditHeader';
import { canSubmitProfileEdit, validateProfileEditDraft } from './profileEditState';
import type { RefObject } from 'react';
import type { ProfileEditFormProps } from './ProfileEditForm';
import type {
  ProfileEditDraft,
  ProfileEditFieldErrors,
  ProfileEditSubmitState,
} from './profileEditState';

export type ProfileEditScreenProps = ProfileEditFormProps & {
  headingRef?: RefObject<Text | null>;
  initialValue: ProfileEditDraft;
  onBack?: () => void;
  onSubmit?: (draft: ProfileEditDraft) => void;
  submitState?: ProfileEditSubmitState;
};

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
    <Text
      accessibilityRole="alert"
      style={[styles.submitStatus, { color: theme.feedbackDangerOnSubtle }]}
    >
      {state.message}
    </Text>
  );
}

export function ProfileEditScreen({
  disabled = false,
  headingRef,
  initialValue,
  onAvatarEdit,
  onAvatarRemove,
  onAvatarRetry,
  onBack,
  onChange,
  onHeaderEdit,
  onHeaderRemove,
  onHeaderRetry,
  onSubmit,
  serverErrors,
  submitState = { kind: 'idle' },
  value,
}: ProfileEditScreenProps) {
  const Root = Platform.OS === 'android' ? KeyboardAvoidingView : View;
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
  const content = (
    <>
      <ProfileEditForm
        disabled={disabled || saving}
        initialValue={initialValue}
        onAvatarEdit={onAvatarEdit}
        onAvatarRemove={onAvatarRemove}
        onAvatarRetry={onAvatarRetry}
        onChange={onChange}
        onHeaderEdit={onHeaderEdit}
        onHeaderRemove={onHeaderRemove}
        onHeaderRetry={onHeaderRetry}
        serverErrors={serverErrors}
        value={value}
      />

      <SubmitStatus state={submitState} />
    </>
  );
  return (
    <Root
      behavior={Platform.OS === 'android' ? 'padding' : undefined}
      testID="profile-edit-screen"
      style={[
        styles.root,
        Platform.OS === 'web' ? styles.webRoot : styles.nativeRoot,
        {
          backgroundColor: theme.backgroundCanvas,
        },
      ]}
    >
      <ProfileEditHeader
        headingRef={headingRef}
        onBack={onBack}
        onSubmit={() => onSubmit?.(value)}
        saveDisabled={!canSubmit}
        saving={saving}
      />

      <RouteScrollContainer
        nativeScrollProps={{
          automaticallyAdjustKeyboardInsets: true,
          contentContainerStyle: styles.nativeContent,
          keyboardShouldPersistTaps: 'handled',
          style: styles.nativeScroll,
        }}
        webStyle={styles.content}
      >
        {content}
      </RouteScrollContainer>
    </Root>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
    maxWidth: 600,
    width: '100%',
  },
  webRoot: { minHeight: '100%' },
  nativeRoot: { flex: 1, minHeight: 0 },
  content: { width: '100%' },
  nativeContent: { flexGrow: 1 },
  nativeScroll: { flex: 1 },
  submitStatus: {
    marginBottom: space[24],
    paddingHorizontal: space[16],
    ...textStyles.uiCopyM,
  },
});
