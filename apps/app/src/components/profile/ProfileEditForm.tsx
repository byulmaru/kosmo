import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes, spacing, typography } from '@/theme/tokens';
import { TextArea, TextField } from '../ui/TextField';
import { ProfileEditImageFields } from './ProfileEditImageFields';
import { validateProfileEditDraft } from './profileEditState';
import { ProfileTagEditor } from './ProfileTagEditor';
import type { ProfileEditDraft, ProfileEditFieldErrors } from './profileEditState';

export type ProfileEditFormProps = {
  disabled?: boolean;
  initialValue: ProfileEditDraft;
  onAvatarEdit?: () => void;
  onAvatarRemove?: () => void;
  onAvatarRetry?: () => void;
  onChange: (next: ProfileEditDraft) => void;
  onHeaderEdit?: () => void;
  onHeaderRemove?: () => void;
  onHeaderRetry?: () => void;
  serverErrors?: ProfileEditFieldErrors;
  showTags?: boolean;
  value: ProfileEditDraft;
};

function countCodePoints(value: string): number {
  return [...value].length;
}

function resolveFieldError(local?: string, server?: string): string | undefined {
  return server ?? local;
}

function FieldError({ message }: { message?: string }) {
  const theme = useTheme();

  if (!message) {
    return null;
  }

  return (
    <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
      {message}
    </Text>
  );
}

export function ProfileEditForm({
  disabled = false,
  initialValue,
  onAvatarEdit,
  onAvatarRemove,
  onAvatarRetry,
  onChange,
  onHeaderEdit,
  onHeaderRemove,
  onHeaderRetry,
  serverErrors,
  showTags = true,
  value,
}: ProfileEditFormProps) {
  const theme = useTheme();
  const localErrors = validateProfileEditDraft(value, initialValue);
  const displayNameError = resolveFieldError(localErrors.displayName, serverErrors?.displayName);
  const bioError = resolveFieldError(localErrors.bio, serverErrors?.bio);

  return (
    <View style={styles.root}>
      <ProfileEditImageFields
        avatar={value.avatar}
        disabled={disabled}
        header={value.header}
        onAvatarEdit={onAvatarEdit}
        onAvatarRemove={onAvatarRemove}
        onAvatarRetry={onAvatarRetry}
        onHeaderEdit={onHeaderEdit}
        onHeaderRemove={onHeaderRemove}
        onHeaderRetry={onHeaderRetry}
      />

      <View style={styles.imageErrors}>
        <FieldError message={serverErrors?.header} />
        <FieldError message={serverErrors?.avatar} />
      </View>

      <View style={styles.fields}>
        <View style={styles.field}>
          <TextField
            accessibilityLabel="표시 이름"
            editable={!disabled}
            error={displayNameError}
            label="표시 이름"
            onChangeText={(displayName) => onChange({ ...value, displayName })}
            value={value.displayName}
          />
          <Text style={[styles.counter, { color: theme.textSecondary }]}>
            {countCodePoints(value.displayName.trim())}/40
          </Text>
        </View>

        <View style={styles.field}>
          <TextArea
            accessibilityLabel="소개"
            editable={!disabled}
            error={bioError}
            label="소개"
            onChangeText={(bio) => onChange({ ...value, bio })}
            value={value.bio}
          />
          <Text style={[styles.counter, { color: theme.textSecondary }]}>
            {value.bio.trim().length}/500
          </Text>
        </View>

        <View style={styles.followPolicyRow}>
          <Text style={[styles.followPolicyLabel, { color: theme.text }]}>
            팔로우 요청 자동 승인
          </Text>
          <Switch
            accessibilityLabel="팔로우 요청 자동 승인"
            disabled={disabled}
            onValueChange={(automaticApproval) =>
              onChange({
                ...value,
                followPolicy: automaticApproval ? 'OPEN' : 'APPROVAL_REQUIRED',
              })
            }
            value={value.followPolicy === 'OPEN'}
          />
        </View>

        {showTags ? (
          <View style={styles.field}>
            <ProfileTagEditor
              disabled={disabled}
              onChange={(tags) => onChange({ ...value, tags })}
              tags={value.tags}
            />
            <FieldError message={serverErrors?.tags} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  imageErrors: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  fields: {
    ...layoutRecipes.formStack,
    ...layoutRecipes.formPageInset,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.xl,
  },
  field: { ...layoutRecipes.labelSupportStack },
  followPolicyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  followPolicyLabel: {
    fontFamily: 'SUIT',
    fontWeight: '600',
    ...typography.md,
  },
  counter: {
    alignSelf: 'flex-end',
    fontFamily: 'SUIT',
    ...typography.xsm,
  },
  error: {
    fontFamily: 'SUIT',
    ...typography.xsm,
  },
});
